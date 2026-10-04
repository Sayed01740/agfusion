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

    // --- Reentrancy guard (cheap, 1/2 pattern) ---
    uint256 private _entered = 1;

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
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
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
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
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
     * @notice Split the attached native value across many recipients in one tx.
     * @dev On Arc the native asset is USDC. Any excess msg.value is refunded to
     *      the caller. Validates the full sum before paying out.
     * @param recipients  Destination addresses.
     * @param values      Native amount (wei) for each recipient.
     */
    function disperseNative(
        address[] calldata recipients,
        uint256[] calldata values
    ) external payable nonReentrant {
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRecipients();
        if (n != values.length) revert LengthMismatch();

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

        for (uint256 i; i < n; ) {
            (bool ok, ) = recipients[i].call{value: values[i]}("");
            if (!ok) revert NativeSendFailed(recipients[i]);
            unchecked {
                ++i;
            }
        }

        uint256 refund = msg.value - total;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
        emit DispersedNative(msg.sender, total, n);
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
}
