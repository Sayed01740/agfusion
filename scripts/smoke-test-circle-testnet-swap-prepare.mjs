#!/usr/bin/env node

const required = [
  "AGFUSION_TESTNET_SMOKE_URL",
  "AGFUSION_TESTNET_SMOKE_ADDRESS",
  "AGFUSION_TESTNET_SMOKE_CONFIRM",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(2);
}
if (process.env.AGFUSION_TESTNET_SMOKE_CONFIRM !== "I_UNDERSTAND_TESTNET_ONLY") {
  console.error("Set AGFUSION_TESTNET_SMOKE_CONFIRM=I_UNDERSTAND_TESTNET_ONLY to confirm this is a Testnet-only quote-preparation check.");
  process.exit(2);
}

const base = new URL(process.env.AGFUSION_TESTNET_SMOKE_URL);
if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
  console.error("Use HTTPS for remote hosts; plain HTTP is allowed only for localhost.");
  process.exit(2);
}
if (base.hostname === "agfusion.vercel.app") {
  console.error("Refusing to run this smoke test against the known production hostname. Use local development or a dedicated preview/staging deployment.");
  process.exit(2);
}

const endpoint = new URL("/api/circle/swap/prepare", base);
const address = process.env.AGFUSION_TESTNET_SMOKE_ADDRESS.trim();
const amount = (process.env.AGFUSION_TESTNET_SMOKE_AMOUNT || "1").trim();
const tokenIn = (process.env.AGFUSION_TESTNET_SMOKE_TOKEN_IN || "USDC").trim().toUpperCase();
const tokenOut = (process.env.AGFUSION_TESTNET_SMOKE_TOKEN_OUT || "EURC").trim().toUpperCase();

if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
  console.error("AGFUSION_TESTNET_SMOKE_ADDRESS must be a valid 20-byte EVM address.");
  process.exit(2);
}
if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
  console.error("AGFUSION_TESTNET_SMOKE_AMOUNT must be a positive decimal amount.");
  process.exit(2);
}
if (!["USDC", "EURC"].includes(tokenIn) || !["USDC", "EURC"].includes(tokenOut) || tokenIn === tokenOut) {
  console.error("Supported smoke-test pairs are USDC→EURC or EURC→USDC.");
  process.exit(2);
}

console.log("Requesting a Circle quote/transaction preparation on Arc Testnet (chainId 5042002).");
console.log("This script does not sign, submit, or broadcast any transaction.");

let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, amount, tokenIn, tokenOut, chainId: 5042002 }),
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
} catch (error) {
  console.error(`Request failed: ${error instanceof Error ? error.message : "unknown network error"}`);
  process.exit(1);
}

let body;
try {
  body = await response.json();
} catch {
  console.error(`Endpoint returned non-JSON response (HTTP ${response.status}).`);
  process.exit(1);
}

if (!response.ok || body?.ok !== true) {
  const message = typeof body?.error === "string" ? body.error : "Quote preparation did not succeed.";
  console.error(`Testnet quote preparation failed (HTTP ${response.status}): ${message}`);
  process.exit(1);
}
if (body.chainId !== 5042002) {
  console.error(`Unexpected chain ID in response: ${String(body.chainId)}; expected 5042002.`);
  process.exit(1);
}
if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
  console.error("Response did not include prepared transaction data.");
  process.exit(1);
}

console.log("PASS: Circle quote/transaction preparation returned successfully for Arc Testnet.");
console.log(`Chain ID: ${body.chainId}`);
console.log(`Pair: ${tokenIn}→${tokenOut}; amount in: ${amount}`);
console.log(`Prepared transaction count: ${body.transactions.length}`);
console.log("No transaction was signed or submitted. Review the quote and transaction payload in the app before any separate, explicit execution flow.");
