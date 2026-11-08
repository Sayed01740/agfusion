import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  ARC_MAINNET_SWAP_TOKENS,
  buildExactPermit2Approval,
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
