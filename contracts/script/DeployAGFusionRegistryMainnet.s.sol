// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionRegistry} from "../src/AGFusionRegistry.sol";

/**
 * Mainnet-only deployment guard for AGFusionRegistry.
 * Requires an explicit owner address (prefer a reviewed multisig).
 * This script only broadcasts when the RPC reports Arc Mainnet chain ID 5042.
 */
contract DeployAGFusionRegistryMainnet is Script {
    function run() external {
        require(block.chainid == 5042, "ARC_MAINNET_ONLY");

        address intendedOwner = vm.envAddress("AGFUSION_OWNER");
        require(intendedOwner != address(0), "OWNER_REQUIRED");

        string memory metadataURI = vm.envString("AGFUSION_METADATA_URI");
        require(bytes(metadataURI).length > 0, "METADATA_URI_REQUIRED");

        console2.log("Arc Mainnet chain ID:", block.chainid);
        console2.log("Deploying Registry; final owner:", intendedOwner);
        console2.log("Metadata:", metadataURI);

        vm.startBroadcast();
        AGFusionRegistry registry = new AGFusionRegistry(metadataURI);
        registry.transferOwnership(intendedOwner);
        vm.stopBroadcast();

        require(registry.owner() == intendedOwner, "OWNER_TRANSFER_FAILED");
        console2.log("AGFusionRegistry deployed at:", address(registry));
        console2.log("Registry owner verified:", registry.owner());
    }
}
