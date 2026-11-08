import { afterEach, vi } from "vitest";
import { encodeFunctionData } from "viem";

const rpc = vi.hoisted(() => ({ call: vi.fn(), estimateGas: vi.fn() }));
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: () => ({ call: rpc.call, estimateGas: rpc.estimateGas }) };
});
import { describe, expect, it } from "vitest";
import {
  ARC_MAINNET_SWAP_TOKENS,
  buildExactPermit2Approval,
  simulateArcMainnetSwapTransaction,
} from "@/blockchain/uniswap-permit2-preflight";
import { ARC_PERMIT2_CONTRACT } from "@/blockchain/uniswap-permit2";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const USDC = ARC_MAINNET_SWAP_TOKENS.USDC;
const APPROVE_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

describe("Arc Mainnet exact Permit2 approval builder", () => {
  it("builds an unsigned exact-amount approval to the canonical Permit2 contract", () => {
    const amount = 1_000_000n;
    const tx = buildExactPermit2Approval(ACCOUNT, USDC, amount);
    expect(tx.chainId).toBe(5042);
    expect(tx.from).toBe(ACCOUNT);
    expect(tx.to).toBe(USDC);
    expect(tx.value).toBe("0");
    expect(tx.spender).toBe(ARC_PERMIT2_CONTRACT);
    expect(tx.amount).toBe(amount);
    expect(tx.data).toBe(encodeFunctionData({
      abi: APPROVE_ABI,
      functionName: "approve",
      args: [ARC_PERMIT2_CONTRACT, amount],
    }));
  });

  it("does not build an unlimited approval", () => {
    const amount = 25_000_000n;
    const tx = buildExactPermit2Approval(ACCOUNT, USDC, amount);
    expect(tx.amount).toBe(amount);
    expect(tx.data).not.toBe(encodeFunctionData({
      abi: APPROVE_ABI,
      functionName: "approve",
      args: [ARC_PERMIT2_CONTRACT, (1n << 256n) - 1n],
    }));
  });

  it.each([0n, -1n, 1n << 160n])("rejects invalid uint160 approval amount %s", (amount) => {
    expect(() => buildExactPermit2Approval(ACCOUNT, USDC, amount)).toThrow(/positive uint160/);
  });

  it("rejects tokens outside the Arc Mainnet allowlist", () => {
    expect(() => buildExactPermit2Approval(ACCOUNT, "0x2222222222222222222222222222222222222222", 1n)).toThrow(/allowlist/);
  });

  it("rejects an invalid wallet address", () => {
    expect(() => buildExactPermit2Approval("not-an-address", USDC, 1n)).toThrow(/wallet account/);
  });
});


describe("Arc Mainnet swap simulation", () => {
  afterEach(() => vi.clearAllMocks());

  const simulationInput = {
    account: ACCOUNT,
    to: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
    data: "0x1234",
    gasLimit: "300000",
    maxFeePerGas: "1000000000",
    nativeGasBalance: 20_000_000_000_000_000n,
  };

  it("requires a successful eth_call and checks gas cost plus reserve", async () => {
    rpc.call.mockResolvedValue({ data: "0x" });
    rpc.estimateGas.mockResolvedValue(250_000n);
    const result = await simulateArcMainnetSwapTransaction(simulationInput);
    expect(result).toMatchObject({
      estimatedGas: 250_000n,
      maxFeePerGas: 1_000_000_000n,
      estimatedGasCost: 250_000_000_000_000n,
      requiredNativeBalance: 15_250_000_000_000_000n,
    });
  });

  it("rejects when eth_call reverts", async () => {
    rpc.call.mockRejectedValue(new Error("execution reverted"));
    await expect(simulateArcMainnetSwapTransaction(simulationInput)).rejects.toThrow(/execution reverted/);
    expect(rpc.estimateGas).not.toHaveBeenCalled();
  });

  it("rejects an estimate above the upstream gas limit", async () => {
    rpc.call.mockResolvedValue({ data: "0x" });
    rpc.estimateGas.mockResolvedValue(300_001n);
    await expect(simulateArcMainnetSwapTransaction(simulationInput)).rejects.toThrow(/exceeds the Uniswap transaction gas limit/);
  });

  it("rejects insufficient native USDC for gas and the reserve", async () => {
    rpc.call.mockResolvedValue({ data: "0x" });
    rpc.estimateGas.mockResolvedValue(250_000n);
    await expect(simulateArcMainnetSwapTransaction({
      ...simulationInput,
      nativeGasBalance: 15_249_999_999_999_999n,
    })).rejects.toThrow(/insufficient for estimated gas/);
  });
});
