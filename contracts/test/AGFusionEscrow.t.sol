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
