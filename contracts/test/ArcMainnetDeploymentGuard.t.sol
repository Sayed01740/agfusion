// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployAGFusionRegistryMainnet} from "../script/DeployAGFusionRegistryMainnet.s.sol";
import {DeployAGFusionEscrowMainnet} from "../script/DeployAGFusionEscrowMainnet.s.sol";
import {DeployAGFusionDisperseMainnet} from "../script/DeployAGFusionDisperseMainnet.s.sol";

contract ArcMainnetDeploymentGuardTest is Test {
    function test_registryDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        new DeployAGFusionRegistryMainnet().run();
    }

    function test_escrowDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        new DeployAGFusionEscrowMainnet().run();
    }

    function test_disperseDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        new DeployAGFusionDisperseMainnet().run();
    }
}
