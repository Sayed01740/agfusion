// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AGFusionRegistry} from "../src/AGFusionRegistry.sol";

contract AGFusionRegistryTest is Test {
    AGFusionRegistry internal reg;
    address internal alice = address(0xA11CE);

    function setUp() public {
        reg = new AGFusionRegistry("https://agfusion.vercel.app/identity/agfusion-agent.json");
    }

    function test_projectInfo() public view {
        (
            string memory name,
            string memory version,
            address projectOwner,
            string memory uri,
            bool isActive,
            uint256 total
        ) = reg.projectInfo();
        assertEq(name, "AGFusion");
        assertEq(version, "1.0.0");
        assertEq(projectOwner, address(this));
        assertTrue(bytes(uri).length > 0);
        assertTrue(isActive);
        assertEq(total, 0);
    }

    function test_register() public {
        vm.prank(alice);
        uint256 id = reg.register("AGFusion Agent", "agent", "https://agfusion.vercel.app");
        assertEq(id, 0);
        AGFusionRegistry.Registration memory r = reg.getRegistration(0);
        assertEq(r.registrant, alice);
        assertEq(r.name, "AGFusion Agent");
        assertEq(reg.registrationCount(), 1);
    }
}
