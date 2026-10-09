// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AGFusionDisperse, IERC20} from "../src/AGFusionDisperse.sol";

/// Minimal EIP-20 for tests (returns bool).
contract MockERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
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
        balanceOf[to] += amount;
        return true;
    }
}

/// Non-compliant token: transferFrom returns no data (like some USDT variants).
contract NoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount, "BAL");
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract AGFusionDisperseTest is Test {
    AGFusionDisperse internal disperse;
    MockERC20 internal token;
    address internal sender = address(0xA11CE);
    address internal r1 = address(0xB0B);
    address internal r2 = address(0xCa11);
    address internal r3 = address(0xD00D);

    function setUp() public {
        disperse = new AGFusionDisperse();
        token = new MockERC20();
        token.mint(sender, 1_000_000);
        vm.prank(sender);
        token.approve(address(disperse), type(uint256).max);
    }

    function test_disperseToken_splitsCorrectly() public {
        address[] memory to = new address[](3);
        to[0] = r1;
        to[1] = r2;
        to[2] = r3;
        uint256[] memory v = new uint256[](3);
        v[0] = 100;
        v[1] = 250;
        v[2] = 650;

        vm.prank(sender);
        disperse.disperseToken(IERC20(address(token)), to, v);

        assertEq(token.balanceOf(r1), 100);
        assertEq(token.balanceOf(r2), 250);
        assertEq(token.balanceOf(r3), 650);
        assertEq(token.balanceOf(sender), 1_000_000 - 1000);
    }

    function test_disperseTokenEqual() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;

        vm.prank(sender);
        disperse.disperseTokenEqual(IERC20(address(token)), to, 500);

        assertEq(token.balanceOf(r1), 500);
        assertEq(token.balanceOf(r2), 500);
    }

    function test_disperseToken_revertsOnLengthMismatch() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory v = new uint256[](1);
        v[0] = 100;

        vm.prank(sender);
        vm.expectRevert(AGFusionDisperse.LengthMismatch.selector);
        disperse.disperseToken(IERC20(address(token)), to, v);
    }

    function test_disperseToken_revertsOnZeroRecipient() public {
        address[] memory to = new address[](1);
        to[0] = address(0);
        uint256[] memory v = new uint256[](1);
        v[0] = 100;

        vm.prank(sender);
        vm.expectRevert(AGFusionDisperse.ZeroRecipient.selector);
        disperse.disperseToken(IERC20(address(token)), to, v);
    }

    function test_disperseToken_supportsNoReturnTokens() public {
        NoReturnERC20 quirky = new NoReturnERC20();
        quirky.mint(sender, 1000);
        vm.prank(sender);
        quirky.approve(address(disperse), type(uint256).max);

        address[] memory to = new address[](1);
        to[0] = r1;
        uint256[] memory v = new uint256[](1);
        v[0] = 400;

        vm.prank(sender);
        disperse.disperseToken(IERC20(address(quirky)), to, v);
        assertEq(quirky.balanceOf(r1), 400);
    }

    function test_disperseToken_revertsOnNonContractToken() public {
        address nonContract = address(0x9999);
        address[] memory to = new address[](1);
        to[0] = r1;
        uint256[] memory v = new uint256[](1);
        v[0] = 100;

        vm.prank(sender);
        vm.expectRevert(AGFusionDisperse.TransferFailed.selector);
        disperse.disperseToken(IERC20(nonContract), to, v);
    }

    function test_disperseToken_revertsOnBatchTooLarge() public {
        address[] memory to = new address[](201);
        uint256[] memory v = new uint256[](201);
        for (uint256 i = 0; i < 201; i++) {
            to[i] = address(uint160(i + 1));
            v[i] = 1;
        }

        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(AGFusionDisperse.BatchTooLarge.selector, 201, 200)
        );
        disperse.disperseToken(IERC20(address(token)), to, v);
    }

    function test_disperseNative_splitsAndRefundsDust_pullModel() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory v = new uint256[](2);
        v[0] = 1 ether;
        v[1] = 2 ether;

        vm.deal(sender, 10 ether);
        vm.prank(sender);
        // Send 1 ether extra to verify refund.
        disperse.disperseNative{value: 4 ether}(to, v);

        // Credits allocated in mapping (pull model)
        assertEq(disperse.nativeCredits(r1), 1 ether);
        assertEq(disperse.nativeCredits(r2), 2 ether);
        assertEq(sender.balance, 10 ether - 3 ether); // 1 ether excess refunded

        // r1 withdraws
        vm.prank(r1);
        disperse.withdraw();
        assertEq(r1.balance, 1 ether);
        assertEq(disperse.nativeCredits(r1), 0);

        // r2 withdraws
        vm.prank(r2);
        disperse.withdraw();
        assertEq(r2.balance, 2 ether);
        assertEq(disperse.nativeCredits(r2), 0);
    }

    function test_disperseNative_revertsOnInsufficientValue() public {
        address[] memory to = new address[](1);
        to[0] = r1;
        uint256[] memory v = new uint256[](1);
        v[0] = 5 ether;

        vm.deal(sender, 10 ether);
        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(AGFusionDisperse.InsufficientValue.selector, uint256(1 ether), uint256(5 ether))
        );
        disperse.disperseNative{value: 1 ether}(to, v);
    }

    function test_withdraw_revertsWhenNoCredits() public {
        vm.prank(r1);
        vm.expectRevert("NO_CREDITS");
        disperse.withdraw();
    }

    function test_totalOf() public view {
        uint256[] memory v = new uint256[](3);
        v[0] = 10;
        v[1] = 20;
        v[2] = 30;
        assertEq(disperse.totalOf(v), 60);
    }
}
