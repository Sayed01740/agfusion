// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AGFusionEscrow} from "../src/AGFusionEscrow.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BAL");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BAL");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MalformedFeeReturnMockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public malformedRecipient;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setMalformedRecipient(address recipient) external {
        malformedRecipient = recipient;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BAL");
        if (to == malformedRecipient) {
            // Simulate a token that returns malformed data and does not move
            // funds on this attempted fee transfer.
            assembly {
                mstore(0, 1)
                return(31, 1)
            }
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BAL");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ToggleTransferMockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!failTransfers, "TRANSFER_BLOCKED");
        require(balanceOf[msg.sender] >= amount, "BAL");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BAL");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FalseFeeTransferMockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public feeRecipient;

    constructor(address feeRecipient_) {
        feeRecipient = feeRecipient_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == feeRecipient) return false;
        require(balanceOf[msg.sender] >= amount, "BAL");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BAL");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FeeOnTransferMockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BAL");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        // Simulate a 10% transfer fee / deflationary token.
        balanceOf[to] += amount - amount / 10;
        return true;
    }
}

contract AGFusionEscrowTest is Test {
    AGFusionEscrow public escrow;
    MockToken public token;

    address public client = address(0x1111);
    address public agent = address(0x2222);
    address public arbitrator = address(0x3333);
    address public feeRecipient = address(0x4444);
    address public keeper = address(0x5555);
    uint256 public feeBps = 50; // 0.5%

    function setUp() public {
        escrow = new AGFusionEscrow(arbitrator, feeBps, feeRecipient);
        token = new MockToken();

        token.mint(client, 1000 ether);
        vm.deal(client, 100 ether);
    }

    function test_CreateTask_revertsWhenTokenTransfersLessThanRequested() public {
        FeeOnTransferMockToken feeToken = new FeeOnTransferMockToken();
        feeToken.mint(client, 100 ether);

        vm.startPrank(client);
        feeToken.approve(address(escrow), 10 ether);
        vm.expectRevert(bytes("UNSUPPORTED_TOKEN"));
        escrow.createTask(agent, address(feeToken), 10 ether, 3600, "details");
        vm.stopPrank();

        // Revert must roll back both the token movement and task creation.
        assertEq(feeToken.balanceOf(client), 100 ether);
        assertEq(feeToken.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalTasks(), 0);
    }

    function test_CreateAndReleaseTask_Token() public {
        vm.startPrank(client);
        token.approve(address(escrow), 100 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(token),
            50 ether,
            3600,
            "ipfs://task-details"
        );
        vm.stopPrank();

        assertEq(taskId, 1);
        assertEq(token.balanceOf(address(escrow)), 50 ether);

        // Agent submits proof
        vm.prank(agent);
        escrow.submitProof(taskId, "ipfs://task-proof");

        // Client releases payment (minus 0.5% fee)
        vm.prank(client);
        escrow.releasePayment(taskId);

        uint256 expectedFee = (50 ether * feeBps) / 10000;
        uint256 expectedNet = 50 ether - expectedFee;

        assertEq(token.balanceOf(agent), expectedNet);
        assertEq(token.balanceOf(feeRecipient), expectedFee);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_releasePaymentTransferFailurePreservesTaskAndFundsForRetry() public {
        ToggleTransferMockToken toggleToken = new ToggleTransferMockToken();
        toggleToken.mint(client, 100 ether);

        vm.startPrank(client);
        toggleToken.approve(address(escrow), 20 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(toggleToken),
            20 ether,
            3600,
            "details"
        );
        vm.stopPrank();

        // A failed fee transfer is handled as best-effort, but if the
        // subsequent agent payout also fails, the whole settlement must roll back.
        toggleToken.setFailTransfers(true);
        vm.prank(client);
        vm.expectRevert(bytes("TRANSFER_FAILED"));
        escrow.releasePayment(taskId);

        AGFusionEscrow.Task memory afterFailedRelease = escrow.getTask(taskId);
        assertEq(uint256(afterFailedRelease.status), uint256(AGFusionEscrow.TaskStatus.Active));
        assertEq(toggleToken.balanceOf(address(escrow)), 20 ether);
        assertEq(toggleToken.balanceOf(agent), 0);
        assertEq(toggleToken.balanceOf(feeRecipient), 0);

        toggleToken.setFailTransfers(false);
        vm.prank(client);
        escrow.releasePayment(taskId);

        AGFusionEscrow.Task memory afterRetry = escrow.getTask(taskId);
        assertEq(uint256(afterRetry.status), uint256(AGFusionEscrow.TaskStatus.Released));
        assertEq(toggleToken.balanceOf(address(escrow)), 0);
        assertEq(toggleToken.balanceOf(agent), 20 ether);
        assertEq(toggleToken.balanceOf(feeRecipient), 0);
    }

    function test_refundExpiredTransferFailurePreservesTaskAndFundsForRetry() public {
        ToggleTransferMockToken toggleToken = new ToggleTransferMockToken();
        toggleToken.mint(client, 100 ether);

        vm.startPrank(client);
        toggleToken.approve(address(escrow), 20 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(toggleToken),
            20 ether,
            120,
            "details"
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 121);
        toggleToken.setFailTransfers(true);

        vm.prank(keeper);
        vm.expectRevert(bytes("TRANSFER_FAILED"));
        escrow.refundExpired(taskId);

        AGFusionEscrow.Task memory afterFailedRefund = escrow.getTask(taskId);
        assertEq(uint256(afterFailedRefund.status), uint256(AGFusionEscrow.TaskStatus.Active));
        assertEq(toggleToken.balanceOf(address(escrow)), 20 ether);
        assertEq(toggleToken.balanceOf(client), 80 ether);

        toggleToken.setFailTransfers(false);
        vm.prank(keeper);
        escrow.refundExpired(taskId);

        AGFusionEscrow.Task memory afterRetry = escrow.getTask(taskId);
        assertEq(uint256(afterRetry.status), uint256(AGFusionEscrow.TaskStatus.Refunded));
        assertEq(toggleToken.balanceOf(address(escrow)), 0);
        assertEq(toggleToken.balanceOf(client), 100 ether);
    }

    function test_disputeRefundTransferFailurePreservesDisputeForRetry() public {
        ToggleTransferMockToken toggleToken = new ToggleTransferMockToken();
        toggleToken.mint(client, 100 ether);

        vm.startPrank(client);
        toggleToken.approve(address(escrow), 20 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(toggleToken),
            20 ether,
            3600,
            "details"
        );
        escrow.disputeTask(taskId, "reason");
        vm.stopPrank();

        toggleToken.setFailTransfers(true);
        vm.prank(arbitrator);
        vm.expectRevert(bytes("TRANSFER_FAILED"));
        escrow.resolveDispute(taskId, false);

        AGFusionEscrow.Task memory afterFailedResolution = escrow.getTask(taskId);
        assertEq(uint256(afterFailedResolution.status), uint256(AGFusionEscrow.TaskStatus.Disputed));
        assertEq(toggleToken.balanceOf(address(escrow)), 20 ether);
        assertEq(toggleToken.balanceOf(client), 80 ether);

        toggleToken.setFailTransfers(false);
        vm.prank(arbitrator);
        escrow.resolveDispute(taskId, false);

        AGFusionEscrow.Task memory afterResolution = escrow.getTask(taskId);
        assertEq(uint256(afterResolution.status), uint256(AGFusionEscrow.TaskStatus.Refunded));
        assertEq(toggleToken.balanceOf(address(escrow)), 0);
        assertEq(toggleToken.balanceOf(client), 100 ether);
    }

    function test_RefundExpiredTask_PermissionlessKeeper() public {
        vm.startPrank(client);
        token.approve(address(escrow), 100 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(token),
            20 ether,
            120, // 2 minutes
            "ipfs://task-details"
        );
        vm.stopPrank();

        // Warp time past deadline
        vm.warp(block.timestamp + 121);

        // Any third-party keeper/bot triggers refund for client
        vm.prank(keeper);
        escrow.refundExpired(taskId);

        assertEq(token.balanceOf(client), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_submitProof_revertsAfterDeadlineAndKeeperCanRefund() public {
        vm.startPrank(client);
        token.approve(address(escrow), 20 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(token),
            20 ether,
            120,
            "ipfs://task-details"
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 121);

        // A late proof must not move the task to Submitted and block the
        // permissionless refund path for an expired, unworked task.
        vm.prank(agent);
        vm.expectRevert(bytes("DEADLINE_PASSED"));
        escrow.submitProof(taskId, "ipfs://late-proof");

        vm.prank(keeper);
        escrow.refundExpired(taskId);

        assertEq(token.balanceOf(client), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
        AGFusionEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint256(task.status), uint256(AGFusionEscrow.TaskStatus.Refunded));
    }

    function test_disputeTask_revertsAfterExpiredActiveDeadlineAndRefundRemainsAvailable() public {
        vm.startPrank(client);
        token.approve(address(escrow), 20 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(token),
            20 ether,
            120,
            "ipfs://task-details"
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 121);

        // Neither party can freeze an expired, unsubmitted task by opening
        // a dispute after the deadline.
        vm.prank(agent);
        vm.expectRevert(bytes("DEADLINE_PASSED"));
        escrow.disputeTask(taskId, "ipfs://late-dispute");

        vm.prank(keeper);
        escrow.refundExpired(taskId);

        assertEq(token.balanceOf(client), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
        AGFusionEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint256(task.status), uint256(AGFusionEscrow.TaskStatus.Refunded));
    }

    function test_DisputeAndArbitratorResolve() public {
        vm.startPrank(client);
        token.approve(address(escrow), 100 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(token),
            30 ether,
            3600,
            "ipfs://task-details"
        );

        // Client raises dispute
        escrow.disputeTask(taskId, "ipfs://reason");
        vm.stopPrank();

        // Arbitrator resolves in favor of agent
        vm.prank(arbitrator);
        escrow.resolveDispute(taskId, true);

        uint256 expectedFee = (30 ether * feeBps) / 10000;
        uint256 expectedNet = 30 ether - expectedFee;

        assertEq(token.balanceOf(agent), expectedNet);
        assertEq(token.balanceOf(feeRecipient), expectedFee);
    }

    function test_CreateTask_revertsOnNonContractToken() public {
        vm.startPrank(client);
        vm.expectRevert("TOKEN_NOT_CONTRACT");
        escrow.createTask(agent, address(0x9999), 10 ether, 3600, "details");
        vm.stopPrank();
    }

    function test_Setters_onlyArbitrator() public {
        address newRecipient = address(0x8888);
        vm.prank(arbitrator);
        escrow.setFeeRecipient(newRecipient);
        assertEq(escrow.feeRecipient(), newRecipient);

        vm.prank(arbitrator);
        escrow.setFeeBps(100);
        assertEq(escrow.feeBps(), 100);

        vm.prank(client);
        vm.expectRevert("ONLY_ARBITRATOR");
        escrow.setFeeRecipient(client);

        vm.prank(client);
        vm.expectRevert("ONLY_ARBITRATOR");
        escrow.setFeeBps(200);
    }

    function test_SettlePayment_handlesMaximumUintAmountWithoutFeeOverflow() public {
        MockToken hugeToken = new MockToken();
        uint256 amount = type(uint256).max;
        hugeToken.mint(client, amount);

        vm.startPrank(client);
        hugeToken.approve(address(escrow), amount);
        uint256 taskId = escrow.createTask(
            agent,
            address(hugeToken),
            amount,
            3600,
            "details"
        );
        vm.stopPrank();

        uint256 expectedFee = (amount / 10000) * feeBps + ((amount % 10000) * feeBps) / 10000;
        uint256 expectedNet = amount - expectedFee;

        vm.prank(client);
        escrow.releasePayment(taskId);

        assertEq(hugeToken.balanceOf(agent), expectedNet);
        assertEq(hugeToken.balanceOf(feeRecipient), expectedFee);
        assertEq(hugeToken.balanceOf(address(escrow)), 0);
    }

    function test_SettlePayment_falseFeeReturnPaysFullAmountToAgent() public {
        FalseFeeTransferMockToken falseFeeToken = new FalseFeeTransferMockToken(feeRecipient);
        falseFeeToken.mint(client, 100 ether);

        vm.startPrank(client);
        falseFeeToken.approve(address(escrow), 10 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(falseFeeToken),
            10 ether,
            3600,
            "details"
        );
        vm.stopPrank();

        vm.prank(client);
        escrow.releasePayment(taskId);

        assertEq(falseFeeToken.balanceOf(agent), 10 ether);
        assertEq(falseFeeToken.balanceOf(feeRecipient), 0);
        assertEq(falseFeeToken.balanceOf(address(escrow)), 0);
        AGFusionEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint256(task.status), uint256(AGFusionEscrow.TaskStatus.Released));
    }

    function test_SettlePayment_malformedFeeReturnDoesNotBlockAgentPayout() public {
        MalformedFeeReturnMockToken malformedToken = new MalformedFeeReturnMockToken();
        malformedToken.mint(client, 100 ether);
        malformedToken.setMalformedRecipient(feeRecipient);

        vm.startPrank(client);
        malformedToken.approve(address(escrow), 10 ether);
        uint256 taskId = escrow.createTask(
            agent,
            address(malformedToken),
            10 ether,
            3600,
            "details"
        );
        vm.stopPrank();

        vm.prank(client);
        escrow.releasePayment(taskId);

        // A short/malformed optional bool return from the fee transfer is
        // treated as fee failure; the full amount is paid to the agent.
        assertEq(malformedToken.balanceOf(agent), 10 ether);
        assertEq(malformedToken.balanceOf(feeRecipient), 0);
        assertEq(malformedToken.balanceOf(address(escrow)), 0);
        AGFusionEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint256(task.status), uint256(AGFusionEscrow.TaskStatus.Released));
    }

    function test_SettlePayment_feeFailureDecoupled() public {
        // Set fee recipient to a contract that rejects native payments or token
        // Even if feeRecipient rejects, agent still receives full payment!
        vm.prank(arbitrator);
        escrow.setFeeRecipient(address(this)); // test contract has no receive() so native transfer fails

        vm.startPrank(client);
        uint256 taskId = escrow.createTaskNative{value: 10 ether}(agent, 3600, "details");
        vm.stopPrank();

        // Release payment - fee transfer will fail, but releasePayment MUST NOT revert!
        uint256 agentBefore = agent.balance;
        vm.prank(client);
        escrow.releasePayment(taskId);

        // Full 10 ether paid to agent since fee failed
        assertEq(agent.balance - agentBefore, 10 ether);
    }
}
