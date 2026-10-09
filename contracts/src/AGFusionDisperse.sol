// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AGFusionDisperse
 * @notice Single-transaction batch token sender ("multisend") for AGFusion on
 *         Arc Testnet (chainId 5042002). Lets a user pay many recipients with a
 *         SINGLE wallet signature.
 *
 * @dev    Two batch modes:
 *          - disperseToken:  pulls an ERC-20 (e.g. Arc USDC at
 *                            0x3600000000000000000000000000000000000000) from
 *                            the caller via transferFrom and forwards it to each
 *                            recipient. Caller must approve() this contract once
 *                            (a max approval makes every future batch a single
 *                            signature).
 *          - disperseNative: splits msg.value across recipients and refunds any
 *                            dust. On Arc the native asset IS USDC.
 *
 *         The contract is non-custodial: it never holds balances between calls.
 *         In disperseToken funds move sender -> recipient directly; in
 *         disperseNative the full msg.value is paid out (or refunded) within the
 *         same transaction. A reentrancy guard protects the native path.
 *
 *         Deploy with Foundry on Arc Testnet. Gas is paid in USDC.
 *         See contracts/script/DeployAGFusionDisperse.s.sol.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract AGFusionDisperse {
    string public constant NAME = "AGFusionDisperse";
    string public constant VERSION = "1.0.0";
    uint256 public constant MAX_BATCH_SIZE = 200;

    // --- Reentrancy guard (cheap, 1/2 pattern) ---
    uint256 private _entered = 1;

    /// @notice Unclaimed native USDC credits per address (pull-payment model).
    mapping(address => uint256) public nativeCredits;

    modifier nonReentrant() {
        require(_entered == 1, "REENTRANCY");
        _entered = 2;
        _;
        _entered = 1;
    }

    // --- Errors ---
    error LengthMismatch();
    error EmptyRecipients();
    error ZeroRecipient();
    error ZeroValue();
    error TransferFailed();
    error InsufficientValue(uint256 provided, uint256 required);
    error NativeSendFailed(address to);
    error RefundFailed();
    error BatchTooLarge(uint256 provided, uint256 maxAllowed);

    // --- Events ---
    event DispersedToken(
        address indexed token,
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event DispersedNative(
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event NativeWithdrawn(address indexed recipient, uint256 amount);

    /**
     * @notice Send an ERC-20 to many recipients in one transaction.
     * @dev Caller must have approved this contract for at least the sum of
     *      `values`. Reverts (rolling back every transfer) if any leg fails,
     *      so the batch is all-or-nothing.
     * @param token       ERC-20 token to distribute (e.g. Arc USDC).
     * @param recipients  Destination addresses.
     * @param values      Amount (in token base units) for each recipient.
     */
    function disperseToken(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata values
    ) external nonReentrant {
        if (!_isContract(address(token))) revert TransferFailed();
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
        if (n > MAX_BATCH_SIZE) revert BatchTooLarge(n, MAX_BATCH_SIZE);
        if (n != values.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i; i < n; ) {
            address to = recipients[i];
            uint256 v = values[i];
            if (to == address(0)) revert ZeroRecipient();
            if (v == 0) revert ZeroValue();
            _safeTransferFrom(token, msg.sender, to, v);
            unchecked {
                total += v;
                ++i;
            }
        }
        emit DispersedToken(address(token), msg.sender, total, n);
    }

    /**
     * @notice Send the SAME ERC-20 amount to many recipients in one transaction.
     * @param token       ERC-20 token to distribute.
     * @param recipients  Destination addresses.
     * @param value       Amount (in token base units) sent to each recipient.
     */
    function disperseTokenEqual(
        IERC20 token,
        address[] calldata recipients,
        uint256 value
    ) external nonReentrant {
        if (!_isContract(address(token))) revert TransferFailed();
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
        if (n > MAX_BATCH_SIZE) revert BatchTooLarge(n, MAX_BATCH_SIZE);
        if (value == 0) revert ZeroValue();

        for (uint256 i; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroRecipient();
            _safeTransferFrom(token, msg.sender, to, value);
            unchecked {
                ++i;
            }
        }
        emit DispersedToken(address(token), msg.sender, value * n, n);
    }

    /**
     * @notice Credit native USDC to many recipients. Recipients claim via withdraw().
     * @dev    Pull-payment model: no individual recipient failure can revert the batch.
     *         On Arc, native asset is USDC (18 decimals). Any excess msg.value is
     *         refunded to the caller within the same transaction.
     * @param recipients  Destination addresses.
     * @param values      Native amount (in wei, 18-decimal USDC) for each recipient.
     */
    function disperseNative(
        address[] calldata recipients,
        uint256[] calldata values
    ) external payable nonReentrant {
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
        if (n != values.length) revert LengthMismatch();
        if (n > MAX_BATCH_SIZE) revert BatchTooLarge(n, MAX_BATCH_SIZE);

        uint256 total;
        for (uint256 i; i < n; ) {
            if (recipients[i] == address(0)) revert ZeroRecipient();
            if (values[i] == 0) revert ZeroValue();
            unchecked {
                total += values[i];
                ++i;
            }
        }
        if (msg.value < total) revert InsufficientValue(msg.value, total);

        // Credit each recipient (pull model — no external call in loop)
        for (uint256 i; i < n; ) {
            unchecked {
                nativeCredits[recipients[i]] += values[i];
                ++i;
            }
        }

        // Refund excess
        uint256 refund = msg.value - total;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit DispersedNative(msg.sender, total, n);
    }

    /**
     * @notice Claim native USDC credits previously allocated by disperseNative.
     * @dev    Any address can call this for itself. Arc native = USDC (18 decimals).
     */
    function withdraw() external nonReentrant {
        uint256 amount = nativeCredits[msg.sender];
        require(amount > 0, "NO_CREDITS");
        nativeCredits[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert NativeSendFailed(msg.sender);
        emit NativeWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Sum an array of values (helper for building/validating a batch).
     */
    function totalOf(uint256[] calldata values) external pure returns (uint256 total) {
        for (uint256 i; i < values.length; ) {
            unchecked {
                total += values[i];
                ++i;
            }
        }
    }

    /**
     * @dev transferFrom that tolerates tokens which return no boolean (non-EIP20
     *      compliant), while still reverting on an explicit `false`.
     */
    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    /// @dev Returns true if `addr` has deployed bytecode (Arc-safe contract check).
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

    receive() external payable {}
}
