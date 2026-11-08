import { describe, expect, it } from "vitest";
import { CommandParser, CommandType, RoutePlanner, UniversalRouterVersion } from "@uniswap/universal-router-sdk";
import {
  ARC_MAINNET_CHAIN_ID, ARC_UNIVERSAL_ROUTER_2_1_2, validateArcMainnetSwapTransaction, assertArcMainnetWalletState,
  type ArcMainnetSwapExpectation, type UniswapSwapTransaction,
} from "@/blockchain/uniswap-mainnet-adapter";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const NOW = 1_800_000_000;
const AMOUNT_IN = 1_000_000n;
const MIN_OUT = 880_000n;
const ROUTER_RECIPIENT = "0x0000000000000000000000000000000000000002";
const expected: ArcMainnetSwapExpectation = { account: ACCOUNT, tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN, minimumAmountOut: MIN_OUT, quotedAmountOut: 900_000n, quoteCreatedAt: NOW - 5, nowSeconds: NOW };

function buildTransaction(planner: RoutePlanner, options: { deadline?: bigint; value?: string; to?: string; from?: string; chainId?: number; gasLimit?: string } = {}): UniswapSwapTransaction {
  const data = CommandParser.INTERFACE.encodeFunctionData("execute(bytes,bytes[],uint256)", [planner.commands, planner.inputs, options.deadline ?? BigInt(NOW + 600)]);
  return { chainId: options.chainId ?? ARC_MAINNET_CHAIN_ID, from: options.from ?? ACCOUNT, to: options.to ?? ARC_UNIVERSAL_ROUTER_2_1_2, data, value: options.value ?? "0", gasLimit: options.gasLimit ?? "250000", maxFeePerGas: "1000000000" };
}
function makeV3Planner(options: { recipient?: string; amountIn?: bigint; amountOutMin?: bigint; payerIsUser?: boolean } = {}): RoutePlanner {
  const planner = new RoutePlanner();
  planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [options.recipient ?? ACCOUNT, options.amountIn ?? AMOUNT_IN, options.amountOutMin ?? MIN_OUT, USDC + "0001f4" + EURC.slice(2), options.payerIsUser ?? true, [0n]], false, UniversalRouterVersion.V2_1_2);
  return planner;
}

describe("Arc Mainnet Universal Router 2.1.2 transaction validation", () => {
  it("accepts a fresh exact-input V3 swap bound to wallet and quote", () => {
    const result = validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner()), expected);
    expect(result.chainId).toBe(5042);
    expect(result.commandNames).toEqual(["V3_SWAP_EXACT_IN"]);
    expect(result.amountIn).toBe(AMOUNT_IN);
    expect(result.minimumAmountOut).toBe(MIN_OUT);
  });
  it("accepts router-held output only with a final exact-token sweep", () => {
    const planner = makeV3Planner({ recipient: ROUTER_RECIPIENT });
    planner.addCommand(CommandType.SWEEP, [EURC, ACCOUNT, MIN_OUT], false, UniversalRouterVersion.V2_1_2);
    expect(validateArcMainnetSwapTransaction(buildTransaction(planner), expected).commandNames).toEqual(["V3_SWAP_EXACT_IN", "SWEEP"]);
  });
  it("rejects router-funded swaps without exact Permit2 input transfer", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner({ payerIsUser: false })), expected)).toThrow(/missing its exact Permit2 input transfer/);
  });
  it("accepts router-funded swaps only with exact Permit2 transfer and final sweep", () => {
    const planner = new RoutePlanner();
    planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [USDC, ROUTER_RECIPIENT, AMOUNT_IN], false, UniversalRouterVersion.V2_1_2);
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [ROUTER_RECIPIENT, AMOUNT_IN, MIN_OUT, USDC + "0001f4" + EURC.slice(2), false, [0n]], false, UniversalRouterVersion.V2_1_2);
    planner.addCommand(CommandType.SWEEP, [EURC, ACCOUNT, MIN_OUT], false, UniversalRouterVersion.V2_1_2);
    expect(validateArcMainnetSwapTransaction(buildTransaction(planner), expected).commandNames).toEqual(["PERMIT2_TRANSFER_FROM", "V3_SWAP_EXACT_IN", "SWEEP"]);
  });
  it.each([
    ["wrong chain", { chainId: 1 }],
    ["wrong router", { to: ACCOUNT }],
    ["wrong sender", { from: "0x2222222222222222222222222222222222222222" }],
    ["non-zero native value", { value: "1" }],
    ["expired deadline", { deadline: BigInt(NOW - 1) }],
    ["deadline beyond 30 minutes", { deadline: BigInt(NOW + 1801) }],
    ["missing gas limit", { gasLimit: "0" }],
  ] as const)("rejects %s", (_label, options) => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner(), options), expected)).toThrow();
  });
  it("rejects mismatched exact input amount", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner({ amountIn: AMOUNT_IN + 1n })), expected)).toThrow(/swap input amount does not match quote/);
  });
  it("rejects minimum output below quote", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner({ amountOutMin: MIN_OUT - 1n })), expected)).toThrow(/minimum output is outside/);
  });
  it("rejects tokens outside the Arc Mainnet allowlist", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner()), {
      ...expected,
      tokenOut: "0x3333333333333333333333333333333333333333",
    })).toThrow(/token pair is not in the Arc Mainnet allowlist/);
  });
  it("rejects unsupported intermediate route tokens", () => {
    const planner = new RoutePlanner();
    const middle = "0x3333333333333333333333333333333333333333";
    const path = USDC + "0001f4" + middle.slice(2) + "0001f4" + EURC.slice(2);
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [ACCOUNT, AMOUNT_IN, MIN_OUT, path, true, [0n, 0n]], false, UniversalRouterVersion.V2_1_2);
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(planner), expected)).toThrow(/intermediate token outside the Arc Mainnet allowlist/);
  });
  it("rejects minimum output greater than the quote output", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner({ amountOutMin: 900_001n })), expected)).toThrow(/outside the user-confirmed quote bounds/);
  });
  it("rejects quote minimum greater than quote output", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner()), {
      ...expected,
      quotedAmountOut: MIN_OUT - 1n,
    })).toThrow(/quote amounts are invalid/);
  });
  it("rejects non-canonical calldata with trailing bytes", () => {
    const tx = buildTransaction(makeV3Planner());
    tx.data += "deadbeef";
    expect(() => validateArcMainnetSwapTransaction(tx, expected)).toThrow(/not canonical or contains trailing data/);
  });
  it("rejects stale quotes", () => {
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(makeV3Planner()), { ...expected, quoteCreatedAt: NOW - 61 })).toThrow(/quote is stale/);
  });
  it("rejects mismatched token path", () => {
    const planner = new RoutePlanner();
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [ACCOUNT, AMOUNT_IN, MIN_OUT, EURC + "0001f4" + USDC.slice(2), true, [0n]], false, UniversalRouterVersion.V2_1_2);
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(planner), expected)).toThrow(/token path does not match/);
  });
  it("rejects allow-revert command flags", () => {
    const tx = buildTransaction(makeV3Planner());
    const outer = CommandParser.INTERFACE.parseTransaction({ data: tx.data });
    if (!outer) throw new Error("test fixture could not be decoded");
    const commands = String(outer.args[0]).replace("0x00", "0x80");
    tx.data = CommandParser.INTERFACE.encodeFunctionData("execute(bytes,bytes[],uint256)", [commands, Array.from(outer.args[1]), outer.args[2]]);
    expect(() => validateArcMainnetSwapTransaction(tx, expected)).toThrow(/command allow-revert or reserved flags/);
  });
  it("rejects exact-output and unsupported commands", () => {
    const planner = new RoutePlanner();
    planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [ACCOUNT, MIN_OUT, AMOUNT_IN, [USDC, EURC], true, [0n]], false, UniversalRouterVersion.V2_1_2);
    expect(() => validateArcMainnetSwapTransaction(buildTransaction(planner), expected)).toThrow(/unsupported command/);
  });
});


describe("Arc Mainnet wallet state guard", () => {
  it("accepts the expected wallet on chain 5042", () => {
    expect(assertArcMainnetWalletState({
      chainId: 5042,
      account: ACCOUNT,
      expectedAccount: ACCOUNT,
    })).toEqual({ chainId: 5042, account: ACCOUNT.toLowerCase() });
  });

  it("rejects a wallet connected to another chain", () => {
    expect(() => assertArcMainnetWalletState({
      chainId: 5042002,
      account: ACCOUNT,
      expectedAccount: ACCOUNT,
    })).toThrow(/not connected to Arc Mainnet/);
  });

  it("rejects an account change after quoting", () => {
    expect(() => assertArcMainnetWalletState({
      chainId: 5042,
      account: "0x2222222222222222222222222222222222222222",
      expectedAccount: ACCOUNT,
    })).toThrow(/account changed/);
  });

  it("rejects a disconnected wallet", () => {
    expect(() => assertArcMainnetWalletState({
      chainId: 5042,
      account: null,
      expectedAccount: ACCOUNT,
    })).toThrow(/connected wallet account/);
  });
});
