// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployAGFusionRegistryMainnet} from "../script/DeployAGFusionRegistryMainnet.s.sol";
import {DeployAGFusionEscrowMainnet} from "../script/DeployAGFusionEscrowMainnet.s.sol";
import {DeployAGFusionDisperseMainnet} from "../script/DeployAGFusionDisperseMainnet.s.sol";

contract ArcMainnetDeploymentGuardTest is Test {
    function test_registryDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        DeployAGFusionRegistryMainnet script = new DeployAGFusionRegistryMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        script.run();
    }

    function test_escrowDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        DeployAGFusionEscrowMainnet script = new DeployAGFusionEscrowMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        script.run();
    }

    function test_disperseDeploymentRejectsNonMainnet() public {
        vm.chainId(31337);
        DeployAGFusionDisperseMainnet script = new DeployAGFusionDisperseMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARC_MAINNET_ONLY"));
        script.run();
    }

    function test_escrowDeploymentRejectsZeroArbitratorBeforeBroadcast() public {
        vm.chainId(5042);
        vm.setEnv("AGFUSION_ARBITRATOR", "0x0000000000000000000000000000000000000000");
        vm.setEnv("AGFUSION_FEE_RECIPIENT", "0x0000000000000000000000000000000000000001");
        vm.setEnv("AGFUSION_ESCROW_FEE_BPS", "100");

        DeployAGFusionEscrowMainnet script = new DeployAGFusionEscrowMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ARBITRATOR_REQUIRED"));
        script.run();
    }

    function test_escrowDeploymentRejectsZeroFeeRecipientBeforeBroadcast() public {
        vm.chainId(5042);
        vm.setEnv("AGFUSION_ARBITRATOR", "0x0000000000000000000000000000000000000001");
        vm.setEnv("AGFUSION_FEE_RECIPIENT", "0x0000000000000000000000000000000000000000");
        vm.setEnv("AGFUSION_ESCROW_FEE_BPS", "100");

        DeployAGFusionEscrowMainnet script = new DeployAGFusionEscrowMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "FEE_RECIPIENT_REQUIRED"));
        script.run();
    }

    function test_escrowDeploymentRejectsFeeAboveCapBeforeBroadcast() public {
        vm.chainId(5042);
        vm.setEnv("AGFUSION_ARBITRATOR", "0x0000000000000000000000000000000000000001");
        vm.setEnv("AGFUSION_FEE_RECIPIENT", "0x0000000000000000000000000000000000000002");
        vm.setEnv("AGFUSION_ESCROW_FEE_BPS", "501");

        DeployAGFusionEscrowMainnet script = new DeployAGFusionEscrowMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "FEE_TOO_HIGH"));
        script.run();
    }

    function test_registryDeploymentRejectsZeroOwnerBeforeBroadcast() public {
        vm.chainId(5042);
        vm.setEnv("AGFUSION_OWNER", "0x0000000000000000000000000000000000000000");
        vm.setEnv("AGFUSION_METADATA_URI", "https://example.invalid/metadata.json");

        DeployAGFusionRegistryMainnet script = new DeployAGFusionRegistryMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "OWNER_REQUIRED"));
        script.run();
    }

    function test_registryDeploymentRejectsEmptyMetadataBeforeBroadcast() public {
        vm.chainId(5042);
        vm.setEnv("AGFUSION_OWNER", "0x0000000000000000000000000000000000000001");
        vm.setEnv("AGFUSION_METADATA_URI", "");

        DeployAGFusionRegistryMainnet script = new DeployAGFusionRegistryMainnet();
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "METADATA_URI_REQUIRED"));
        script.run();
    }
}
