// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionRegistry} from "../src/AGFusionRegistry.sol";

/**
 * Deploy (recommended — pass key on CLI):
 *   forge script script/DeployAGFusionRegistry.s.sol:DeployAGFusionRegistry \
 *     --rpc-url https://rpc.testnet.arc.network \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 *
 * forge injects the broadcaster from --private-key; no envUint needed.
 */
contract DeployAGFusionRegistry is Script {
    function run() external {
        string memory metadataURI = vm.envOr(
            "AGFUSION_METADATA_URI",
            string("https://agfusion.vercel.app/identity/agfusion-agent.json")
        );

        console2.log("Metadata:", metadataURI);
        console2.log("Broadcasting from:", msg.sender);

        vm.startBroadcast();
        AGFusionRegistry reg = new AGFusionRegistry(metadataURI);
        vm.stopBroadcast();

        console2.log("AGFusionRegistry deployed at:", address(reg));
        console2.log("Owner:", reg.owner());
        console2.log("Explorer: https://testnet.arcscan.app/address/", address(reg));
    }
}
