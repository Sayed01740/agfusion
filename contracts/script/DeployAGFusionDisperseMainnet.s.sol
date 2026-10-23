// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionDisperse} from "../src/AGFusionDisperse.sol";

/**
 * Mainnet-only deployment guard for AGFusionDisperse.
 * The contract has no owner/admin; still require chain ID 5042 before broadcast.
 */
contract DeployAGFusionDisperseMainnet is Script {
    function run() external {
        require(block.chainid == 5042, "ARC_MAINNET_ONLY");

        console2.log("Arc Mainnet chain ID:", block.chainid);
        console2.log("Deploying AGFusionDisperse");

        vm.startBroadcast();
        AGFusionDisperse disperse = new AGFusionDisperse();
        vm.stopBroadcast();

        require(bytes(disperse.VERSION()).length > 0, "DEPLOYMENT_CHECK_FAILED");
        console2.log("AGFusionDisperse deployed at:", address(disperse));
        console2.log("Version:", disperse.VERSION());
    }
}
