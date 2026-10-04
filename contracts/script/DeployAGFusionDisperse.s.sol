// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionDisperse} from "../src/AGFusionDisperse.sol";

/**
 * Deploy the AGFusionDisperse batch-send contract on Arc Testnet.
 *
 * Recommended (pass key on CLI):
 *   forge script script/DeployAGFusionDisperse.s.sol:DeployAGFusionDisperse \
 *     --rpc-url https://rpc.testnet.arc.network \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 *
 * After deploy, copy the printed address into the app env:
 *   NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS=0x...
 *
 * forge injects the broadcaster from --private-key; no envUint needed.
 */
contract DeployAGFusionDisperse is Script {
    function run() external {
        console2.log("Deploying AGFusionDisperse from:", msg.sender);

        vm.startBroadcast();
        AGFusionDisperse disperse = new AGFusionDisperse();
        vm.stopBroadcast();

        console2.log("AGFusionDisperse deployed at:", address(disperse));
        console2.log("Version:", disperse.VERSION());
        console2.log("Set env NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS to the address above.");
        console2.log("Explorer: https://testnet.arcscan.app/address/");
        console2.log(address(disperse));
    }
}
