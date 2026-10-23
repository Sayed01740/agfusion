#!/usr/bin/env node

/**
 * Read-only preflight for Arc Mainnet. This script never signs or broadcasts.
 * Run: npm run verify:arc-mainnet
 *
 * Requires the three AGFusion Mainnet contract addresses and expected control
 * settings. It intentionally fails until real deployments have been configured.
 */
import { decodeFunctionResult, encodeFunctionData, isAddress, parseAbi } from "viem";

const rpcUrl = (process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io").trim();
const expectedChainId = 5042;
const registryAddress = process.env.NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS?.trim() || "";
const escrowAddress = process.env.NEXT_PUBLIC_AGFUSION_ESCROW_MAINNET_ADDRESS?.trim() || "";
const disperseAddress = process.env.NEXT_PUBLIC_AGFUSION_DISPERSE_MAINNET_ADDRESS?.trim() || "";
const expectedRegistryOwner = process.env.AGFUSION_EXPECTED_REGISTRY_OWNER?.trim() || "";
const expectedArbitrator = process.env.AGFUSION_EXPECTED_ESCROW_ARBITRATOR?.trim() || "";
const expectedFeeRecipient = process.env.AGFUSION_EXPECTED_ESCROW_FEE_RECIPIENT?.trim() || "";
const expectedFeeBpsRaw = process.env.AGFUSION_EXPECTED_ESCROW_FEE_BPS?.trim() || "";

const checks = [
  ["CCTP TokenMessengerV2", "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"],
  ["CCTP MessageTransmitterV2", "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"],
  ["Arc native USDC ERC-20 interface", "0x3600000000000000000000000000000000000000"],
];

const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function active() view returns (bool)",
  "function VERSION() view returns (string)",
]);
const escrowAbi = parseAbi([
  "function arbitrator() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function VERSION() view returns (string)",
]);
const disperseAbi = parseAbi(["function VERSION() view returns (string)"]);

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC returned an error");
  return payload.result;
}

async function readContract(address, abi, functionName) {
  const data = encodeFunctionData({ abi, functionName });
  const result = await rpc("eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result });
}

function requireAddress(label, value) {
  if (!isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    throw new Error(`Missing or invalid ${label}; preflight will not assume a deployment address.`);
  }
}

function sameAddress(actual, expected) {
  return String(actual).toLowerCase() === String(expected).toLowerCase();
}

try {
  requireAddress("NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS", registryAddress);
  requireAddress("NEXT_PUBLIC_AGFUSION_ESCROW_MAINNET_ADDRESS", escrowAddress);
  requireAddress("NEXT_PUBLIC_AGFUSION_DISPERSE_MAINNET_ADDRESS", disperseAddress);
  requireAddress("AGFUSION_EXPECTED_REGISTRY_OWNER", expectedRegistryOwner);
  requireAddress("AGFUSION_EXPECTED_ESCROW_ARBITRATOR", expectedArbitrator);
  requireAddress("AGFUSION_EXPECTED_ESCROW_FEE_RECIPIENT", expectedFeeRecipient);

  if (!/^\d+$/.test(expectedFeeBpsRaw)) {
    throw new Error("AGFUSION_EXPECTED_ESCROW_FEE_BPS must be explicitly set to an integer from 0 to 500.");
  }
  const expectedFeeBps = Number(expectedFeeBpsRaw);
  if (!Number.isSafeInteger(expectedFeeBps) || expectedFeeBps < 0 || expectedFeeBps > 500) {
    throw new Error("AGFUSION_EXPECTED_ESCROW_FEE_BPS must be from 0 to 500.");
  }

  const rawChainId = String(await rpc("eth_chainId")).trim().toLowerCase();
  const chainId = rawChainId.startsWith("0x")
    ? Number.parseInt(rawChainId.slice(2), 16)
    : /^\d+$/.test(rawChainId)
      ? Number(rawChainId)
      : Number.NaN;
  if (!Number.isSafeInteger(chainId) || chainId !== expectedChainId) {
    throw new Error(`Wrong chain ID ${rawChainId}; expected Arc Mainnet chain ID 5042 (0x13b2). No write operations were attempted.`);
  }
  console.log(`PASS chain ID: ${rawChainId} (Arc Mainnet / 5042)`);

  for (const [label, address] of checks) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (!code || code === "0x" || /^0x0*$/i.test(code)) {
      throw new Error(`No contract bytecode for ${label} at ${address}`);
    }
    console.log(`PASS ${label}: ${(code.length - 2) / 2} bytes of bytecode`);
  }

  const appContracts = [
    ["AGFusionRegistry", registryAddress],
    ["AGFusionEscrow", escrowAddress],
    ["AGFusionDisperse", disperseAddress],
  ];
  for (const [label, address] of appContracts) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (!code || code === "0x" || /^0x0*$/i.test(code)) {
      throw new Error(`No deployed bytecode for ${label} at ${address}`);
    }
    console.log(`PASS ${label} bytecode: ${(code.length - 2) / 2} bytes at ${address}`);
  }

  const [registryOwner, registryActive, registryVersion] = await Promise.all([
    readContract(registryAddress, registryAbi, "owner"),
    readContract(registryAddress, registryAbi, "active"),
    readContract(registryAddress, registryAbi, "VERSION"),
  ]);
  if (!sameAddress(registryOwner, expectedRegistryOwner)) {
    throw new Error(`Registry owner mismatch: got ${registryOwner}; expected ${expectedRegistryOwner}`);
  }
  if (registryActive !== true) throw new Error("AGFusionRegistry is not active.");
  if (registryVersion !== "1.1.0") throw new Error(`Unexpected AGFusionRegistry version: ${registryVersion}`);
  console.log(`PASS Registry owner/active/version: ${registryOwner} / active / ${registryVersion}`);

  const [arbitrator, feeRecipient, feeBps, escrowVersion] = await Promise.all([
    readContract(escrowAddress, escrowAbi, "arbitrator"),
    readContract(escrowAddress, escrowAbi, "feeRecipient"),
    readContract(escrowAddress, escrowAbi, "feeBps"),
    readContract(escrowAddress, escrowAbi, "VERSION"),
  ]);
  if (!sameAddress(arbitrator, expectedArbitrator)) {
    throw new Error(`Escrow arbitrator mismatch: got ${arbitrator}; expected ${expectedArbitrator}`);
  }
  if (!sameAddress(feeRecipient, expectedFeeRecipient)) {
    throw new Error(`Escrow fee recipient mismatch: got ${feeRecipient}; expected ${expectedFeeRecipient}`);
  }
  if (Number(feeBps) !== expectedFeeBps) {
    throw new Error(`Escrow fee mismatch: got ${feeBps}; expected ${expectedFeeBps}`);
  }
  if (escrowVersion !== "1.1.0") throw new Error(`Unexpected AGFusionEscrow version: ${escrowVersion}`);
  console.log(`PASS Escrow arbitrator/fee recipient/fee bps/version: ${arbitrator} / ${feeRecipient} / ${feeBps} / ${escrowVersion}`);

  const disperseVersion = await readContract(disperseAddress, disperseAbi, "VERSION");
  if (disperseVersion !== "1.0.0") throw new Error(`Unexpected AGFusionDisperse version: ${disperseVersion}`);
  console.log(`PASS Disperse version: ${disperseVersion}`);

  console.log("Read-only Mainnet preflight passed. No transaction was signed or broadcast.");
} catch (error) {
  console.error(`FAIL Arc Mainnet preflight: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
