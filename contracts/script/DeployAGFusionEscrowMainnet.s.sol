// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AGFusionEscrow} from "../src/AGFusionEscrow.sol";

/**
 * Mainnet-only deployment guard for AGFusionEscrow.
 * Arbitrator and fee recipient must be explicitly configured, not defaulted to
 * the deployment EOA. Use reviewed multisig / governance addresses.
 */
contract DeployAGFusionEscrowMainnet is Script {
    function run() external {
        require(block.chainid == 5042, "ARC_MAINNET_ONLY");

        address arbitrator = vm.envAddress("AGFUSION_ARBITRATOR");
        address feeRecipient = vm.envAddress("AGFUSION_FEE_RECIPIENT");
        uint256 feeBps = vm.envUint("AGFUSION_ESCROW_FEE_BPS");
        require(arbitrator != address(0), "ARBITRATOR_REQUIRED");
        require(feeRecipient != address(0), "FEE_RECIPIENT_REQUIRED");
        require(feeBps <= 500, "FEE_TOO_HIGH");

        console2.log("Arc Mainnet chain ID:", block.chainid);
        console2.log("Escrow arbitrator:", arbitrator);
        console2.log("Escrow fee recipient:", feeRecipient);
        console2.log("Escrow fee bps:", feeBps);

        vm.startBroadcast();
        AGFusionEscrow escrow = new AGFusionEscrow(arbitrator, feeBps, feeRecipient);
        vm.stopBroadcast();

        require(escrow.arbitrator() == arbitrator, "ARBITRATOR_MISMATCH");
        require(escrow.feeRecipient() == feeRecipient, "FEE_RECIPIENT_MISMATCH");
        require(escrow.feeBps() == feeBps, "FEE_BPS_MISMATCH");
        console2.log("AGFusionEscrow deployed at:", address(escrow));
    }
}
