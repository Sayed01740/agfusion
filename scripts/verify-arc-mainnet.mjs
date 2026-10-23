#!/usr/bin/env node

/**
 * Read-only preflight for Arc Mainnet. This script never signs or broadcasts.
 * Run: npm run verify:arc-mainnet
 */
const rpcUrl = (process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io").trim();
const expectedChainId = 5042;
const checks = [
  ["CCTP TokenMessengerV2", "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"],
  ["CCTP MessageTransmitterV2", "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"],
  ["Arc native USDC ERC-20 interface", "0x3600000000000000000000000000000000000000"],
];

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

try {
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

  let failed = false;
  for (const [label, address] of checks) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (!code || code === "0x" || /^0x0*$/i.test(code)) {
      console.error(`FAIL ${label}: no contract bytecode at ${address}`);
      failed = true;
    } else {
      const byteLength = (code.length - 2) / 2;
      console.log(`PASS ${label}: ${byteLength} bytes of bytecode at ${address}`);
    }
  }
  if (failed) process.exitCode = 1;
  else console.log("Read-only Mainnet preflight passed. This does not verify ABI compatibility, ownership, or application contract deployment.");
} catch (error) {
  console.error(`FAIL Arc Mainnet preflight: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
