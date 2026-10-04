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

    function setUp() public {
        escrow = new AGFusionEscrow();
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

        // Client releases payment
        vm.prank(client);
        escrow.releasePayment(taskId);

        assertEq(token.balanceOf(agent), 50 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_RefundExpiredTask() public {
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

        vm.prank(client);
        escrow.refundExpired(taskId);

        assertEq(token.balanceOf(client), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }
}
