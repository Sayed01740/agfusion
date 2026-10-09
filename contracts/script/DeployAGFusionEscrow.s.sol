// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionEscrow} from "../src/AGFusionEscrow.sol";

/**
 * Deploy AGFusionEscrow on Arc Testnet.
 *
 * Usage:
 *   forge script script/DeployAGFusionEscrow.s.sol:DeployAGFusionEscrow \
 *     --rpc-url https://rpc.testnet.arc.network \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 *
 * Set env:
 *   NEXT_PUBLIC_AGFUSION_ESCROW_ADDRESS=0x...
 */
contract DeployAGFusionEscrow is Script {
    function run() external {
        console2.log("Deploying AGFusionEscrow from:", msg.sender);

        vm.startBroadcast();
        // arbitrator: msg.sender, feeBps: 50 (0.5%), feeRecipient: msg.sender
        AGFusionEscrow escrow = new AGFusionEscrow(msg.sender, 50, msg.sender);
        vm.stopBroadcast();

        console2.log("AGFusionEscrow deployed at:", address(escrow));
        console2.log("Version:", escrow.VERSION());
        console2.log("Set NEXT_PUBLIC_AGFUSION_ESCROW_ADDRESS in .env.local to the address above.");
    }
}
