import { CommandParser, ROUTER_AS_RECIPIENT, UniversalRouterVersion } from "@uniswap/universal-router-sdk";
import { isAddress } from "viem";

export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_UNIVERSAL_ROUTER_2_1_2 = "0x8702463e73f74d0b6765aBceb314Ef07aCb92650";
export const ARC_PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const MAX_QUOTE_AGE_SECONDS = 60;
const MAX_TRANSACTION_DEADLINE_SECONDS = 30 * 60;
const MAX_COMMANDS = 8;
const ARC_MAINNET_TOKEN_ADDRESSES = new Set([
  "0x3600000000000000000000000000000000000000",
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1",
  "0x171a4217b86a807a64eb94757db6849fb4bdbAA0".toLowerCase(),
]);

export type ArcMainnetSwapExpectation = {
  account: string; tokenIn: string; tokenOut: string; amountIn: bigint;
  minimumAmountOut: bigint; quotedAmountOut: bigint; quoteCreatedAt: number; nowSeconds?: number;
};
export type UniswapSwapTransaction = {
  chainId: number | string; from: string; to: string; data: string; value: string;
  gasLimit?: string; gasPrice?: string; maxFeePerGas?: string;
};
export type ValidatedArcMainnetSwap = {
  chainId: 5042; from: string; to: string; data: string; value: "0";
  deadline: bigint; commandNames: string[]; amountIn: bigint; minimumAmountOut: bigint;
};

function fail(message: string): never {
  throw new Error("Arc Mainnet swap transaction rejected: " + message);
}
function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAddress(value)) fail("invalid " + label);
  return value.toLowerCase();
}
function toUnsignedBigInt(value: unknown, label: string): bigint {
  let serialized: string;
  if (typeof value === "bigint" || typeof value === "string" || typeof value === "number") serialized = String(value);
  else if (value !== null && typeof value === "object" && "toString" in value && typeof value.toString === "function") serialized = value.toString();
  else return fail("invalid " + label);
  if (!/^\d+$/.test(serialized)) fail("invalid " + label);
  return BigInt(serialized);
}
function getParam(command: ReturnType<typeof CommandParser.parseCalldata>["commands"][number], name: string): unknown {
  return command.params.find((param) => param.name === name)?.value;
}
function decodePath(command: ReturnType<typeof CommandParser.parseCalldata>["commands"][number]): string[] {
  const path = getParam(command, "path");
  if (!Array.isArray(path)) fail("swap path is missing or malformed");
  if (command.commandName === "V2_SWAP_EXACT_IN") {
    if (path.length < 2) fail("V2 path must contain at least two tokens");
    return path.map((address) => normalizeAddress(address, "V2 path token"));
  }
  if (command.commandName === "V3_SWAP_EXACT_IN") {
    if (path.length < 1) fail("V3 path must contain at least one pool hop");
    const hops: string[] = [];
    for (const item of path) {
      if (item === null || typeof item !== "object") fail("malformed V3 path hop");
      const hop = item as { tokenIn?: unknown; tokenOut?: unknown; fee?: unknown };
      const tokenIn = normalizeAddress(hop.tokenIn, "V3 path input token");
      const tokenOut = normalizeAddress(hop.tokenOut, "V3 path output token");
      const fee = Number(hop.fee);
      if (!Number.isInteger(fee) || fee < 1 || fee > 1_000_000) fail("invalid V3 pool fee");
      if (hops.length > 0 && hops[hops.length - 1] !== tokenIn) fail("disconnected V3 path");
      if (hops.length === 0) hops.push(tokenIn);
      hops.push(tokenOut);
    }
    return hops;
  }
  return fail("unsupported swap command");
}

/** Validation only. Never requests a wallet, signs, broadcasts, or simulates. */
export function validateArcMainnetSwapTransaction(transaction: UniswapSwapTransaction, expected: ArcMainnetSwapExpectation): ValidatedArcMainnetSwap {
  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) fail("invalid local clock");
  if (!Number.isSafeInteger(expected.quoteCreatedAt) || expected.quoteCreatedAt > now || now - expected.quoteCreatedAt > MAX_QUOTE_AGE_SECONDS) fail("quote is stale or has an invalid timestamp");
  if (expected.amountIn <= 0n || expected.minimumAmountOut <= 0n || expected.quotedAmountOut <= 0n || expected.minimumAmountOut > expected.quotedAmountOut) fail("quote amounts are invalid or minimum output exceeds quoted output");

  const account = normalizeAddress(expected.account, "wallet account");
  const tokenIn = normalizeAddress(expected.tokenIn, "input token");
  const tokenOut = normalizeAddress(expected.tokenOut, "output token");
  if (tokenIn === tokenOut) fail("input and output tokens must differ");
  if (!ARC_MAINNET_TOKEN_ADDRESSES.has(tokenIn) || !ARC_MAINNET_TOKEN_ADDRESSES.has(tokenOut)) fail("token pair is not in the Arc Mainnet allowlist");
  if (Number(transaction.chainId) !== ARC_MAINNET_CHAIN_ID) fail("transaction chain ID is not Arc Mainnet (5042)");
  if (normalizeAddress(transaction.from, "transaction sender") !== account) fail("transaction sender does not match the quoted wallet");
  if (normalizeAddress(transaction.to, "transaction destination") !== ARC_UNIVERSAL_ROUTER_2_1_2.toLowerCase()) fail("transaction destination is not the allowlisted Universal Router 2.1.2");
  if (typeof transaction.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(transaction.data)) fail("transaction calldata is malformed");
  if (transaction.data.length > 200_000) fail("transaction calldata exceeds the size limit");

  let value: bigint;
  try { value = BigInt(transaction.value); } catch { return fail("invalid native transaction value"); }
  if (value !== 0n) fail("native transaction value must be zero");
  const gasLimit = transaction.gasLimit ? toUnsignedBigInt(transaction.gasLimit, "gas limit") : 0n;
  if (gasLimit <= 0n) fail("gas limit is missing or zero");
  const gasPrice = transaction.maxFeePerGas || transaction.gasPrice;
  if (!gasPrice || toUnsignedBigInt(gasPrice, "gas price") <= 0n) fail("gas price is missing or zero");

  let outer: ReturnType<typeof CommandParser.INTERFACE.parseTransaction>;
  try { outer = CommandParser.INTERFACE.parseTransaction({ data: transaction.data }); }
  catch { return fail("calldata is not a valid Universal Router execute call"); }
  if (!outer || outer.name !== "execute" || outer.args.length !== 3) fail("execute call must include an explicit deadline");
  const canonicalData = CommandParser.INTERFACE.encodeFunctionData(outer.signature, Array.from(outer.args));
  if (canonicalData.toLowerCase() !== transaction.data.toLowerCase()) fail("calldata is not canonical or contains trailing data");

  const rawCommands = String(outer.args[0]);
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(rawCommands)) fail("command stream is malformed");
  const commandBytes = rawCommands.slice(2).match(/.{2}/g) ?? [];
  if (commandBytes.length === 0 || commandBytes.length > MAX_COMMANDS) fail("command count is outside the allowed range");
  if (!Array.isArray(outer.args[1]) || outer.args[1].length !== commandBytes.length) fail("command input count does not match command stream");
  for (const byteText of commandBytes) {
    const byte = Number.parseInt(byteText, 16);
    if ((byte & 0xc0) !== 0) fail("command allow-revert or reserved flags are not permitted");
  }

  const deadline = toUnsignedBigInt(outer.args[2], "transaction deadline");
  if (deadline <= BigInt(now) || deadline > BigInt(now + MAX_TRANSACTION_DEADLINE_SECONDS)) fail("transaction deadline is expired or exceeds 30 minutes");

  let parsed: ReturnType<typeof CommandParser.parseCalldata>;
  try { parsed = CommandParser.parseCalldata(transaction.data, UniversalRouterVersion.V2_1_2); }
  catch { return fail("Universal Router 2.1.2 command decoding failed"); }
  if (parsed.commands.length !== commandBytes.length) fail("decoded command count does not match raw command stream");

  const allowedCommands = new Set(["PERMIT2_TRANSFER_FROM", "V2_SWAP_EXACT_IN", "V3_SWAP_EXACT_IN", "SWEEP"]);
  for (let i = 0; i < parsed.commands.length; i += 1) {
    const command = parsed.commands[i];
    if (command.commandType !== Number.parseInt(commandBytes[i], 16) || !allowedCommands.has(command.commandName)) fail("unsupported command at position " + i);
  }

  const names = parsed.commands.map((command) => command.commandName);
  const swapIndexes = names.map((name, index) => name === "V2_SWAP_EXACT_IN" || name === "V3_SWAP_EXACT_IN" ? index : -1).filter((index) => index >= 0);
  if (swapIndexes.length !== 1) fail("exactly one exact-input V2/V3 swap is required");
  const swapIndex = swapIndexes[0];
  const swap = parsed.commands[swapIndex];
  const transferIndexes = names.map((name, index) => name === "PERMIT2_TRANSFER_FROM" ? index : -1).filter((index) => index >= 0);
  if (transferIndexes.length > 1 || (transferIndexes.length === 1 && transferIndexes[0] !== 0)) fail("Permit2 input transfer must be the first and only transfer command");

  const payerIsUser = getParam(swap, "payerIsUser");
  if (typeof payerIsUser !== "boolean") fail("swap payer mode is malformed");
  if (payerIsUser && transferIndexes.length !== 0) fail("duplicate input funding instructions");
  if (!payerIsUser && transferIndexes.length !== 1) fail("router-funded swap is missing its exact Permit2 input transfer");

  if (transferIndexes.length === 1) {
    const transfer = parsed.commands[transferIndexes[0]];
    if (normalizeAddress(getParam(transfer, "token"), "Permit2 transfer token") !== tokenIn) fail("Permit2 transfer token does not match quote input");
    if (normalizeAddress(getParam(transfer, "recipient"), "Permit2 transfer recipient") !== ROUTER_AS_RECIPIENT.toLowerCase()) fail("Permit2 transfer recipient is not the Universal Router");
    if (toUnsignedBigInt(getParam(transfer, "amount"), "Permit2 transfer amount") !== expected.amountIn) fail("Permit2 transfer amount does not match exact quote input");
  }

  const amountIn = toUnsignedBigInt(getParam(swap, "amountIn"), "swap input amount");
  if (amountIn !== expected.amountIn) fail("swap input amount does not match quote");
  const path = decodePath(swap);
  if (path[0] !== tokenIn || path[path.length - 1] !== tokenOut) fail("decoded token path does not match quote pair");
  if (path.some((address) => !ARC_MAINNET_TOKEN_ADDRESSES.has(address))) fail("route contains an intermediate token outside the Arc Mainnet allowlist");
  const hopPrices = getParam(swap, "minHopPriceX36");
  if (!Array.isArray(hopPrices) || hopPrices.length !== path.length - 1) fail("per-hop slippage bounds are missing or malformed");
  for (const price of hopPrices) toUnsignedBigInt(price, "per-hop minimum price");

  const swapRecipient = normalizeAddress(getParam(swap, "recipient"), "swap recipient");
  const directToWallet = swapRecipient === account;
  const toRouter = swapRecipient === ROUTER_AS_RECIPIENT.toLowerCase();
  if (!directToWallet && !toRouter) fail("swap recipient is not the quoted wallet or router");
  const sweepIndexes = names.map((name, index) => name === "SWEEP" ? index : -1).filter((index) => index >= 0);
  if (toRouter) {
    if (sweepIndexes.length !== 1 || sweepIndexes[0] !== parsed.commands.length - 1) fail("router-held output requires one final SWEEP command");
    const sweep = parsed.commands[sweepIndexes[0]];
    if (normalizeAddress(getParam(sweep, "token"), "sweep token") !== tokenOut) fail("sweep token does not match quote output");
    if (normalizeAddress(getParam(sweep, "recipient"), "sweep recipient") !== account) fail("sweep recipient does not match quoted wallet");
    const sweepMinimum = toUnsignedBigInt(getParam(sweep, "amountMin"), "sweep minimum output");
    if (sweepMinimum < expected.minimumAmountOut || sweepMinimum > expected.quotedAmountOut) fail("sweep minimum output is outside the user-confirmed quote bounds");
  } else {
    if (sweepIndexes.length !== 0) fail("unexpected sweep after direct-to-wallet swap");
    const swapMinimum = toUnsignedBigInt(getParam(swap, "amountOutMin"), "swap minimum output");
    if (swapMinimum < expected.minimumAmountOut || swapMinimum > expected.quotedAmountOut) fail("swap minimum output is outside the user-confirmed quote bounds");
  }

  if (parsed.commands.length !== transferIndexes.length + 1 + sweepIndexes.length) fail("transaction contains an unexpected command");
  if (transferIndexes.length === 1 && transferIndexes[0] > swapIndex) fail("input transfer occurs after the swap");
  if (sweepIndexes.length === 1 && sweepIndexes[0] < swapIndex) fail("sweep occurs before the swap");

  return { chainId: ARC_MAINNET_CHAIN_ID, from: account, to: ARC_UNIVERSAL_ROUTER_2_1_2, data: transaction.data, value: "0", deadline, commandNames: names, amountIn, minimumAmountOut: expected.minimumAmountOut };
}
