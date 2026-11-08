import { describe, expect, it, vi } from "vitest";
import type { ChainId } from "@/types";

const walletMocks = vi.hoisted(() => ({
  getInjectedProvider: vi.fn(),
}));

vi.mock("@/sdk/wallet-adapter", () => ({
  getInjectedProvider: walletMocks.getInjectedProvider,
  requestAccounts: vi.fn(),
  switchToChainId: vi.fn(),
}));

import {
  assertArcMainnetSwapAvailable,
  assertArcTestnetSwapExecution,
  runProductionSwap,
} from "@/blockchain/production-swap";

describe("Arc Mainnet swap execution release gate", () => {
  it("fails closed for Mainnet before wallet access or transaction preparation", () => {
    expect(() => assertArcMainnetSwapAvailable(true)).toThrow(
      /Arc Mainnet swaps are not enabled yet/,
    );
  });

  it.each(["Arc_Mainnet", "Arc"] as const)(
    "rejects %s before requesting a wallet provider or preparing a transaction",
    async (chain) => {
      walletMocks.getInjectedProvider.mockClear();

      await expect(runProductionSwap({
        amount: "1",
        tokenIn: "USDC",
        tokenOut: "EURC",
        chain,
      })).rejects.toThrow(/Arc Mainnet swaps are not enabled yet/);

      expect(walletMocks.getInjectedProvider).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown chain values before requesting a wallet provider", async () => {
    walletMocks.getInjectedProvider.mockClear();

    await expect(runProductionSwap({
      amount: "1",
      tokenIn: "USDC",
      tokenOut: "EURC",
      chain: "Ethereum" as ChainId,
    })).rejects.toThrow(/only supported on Arc Mainnet and Arc Testnet/i);

    expect(walletMocks.getInjectedProvider).not.toHaveBeenCalled();
  });

  it("allows execution only on the exact Arc Testnet chain", () => {
    expect(() => assertArcTestnetSwapExecution("Arc_Testnet")).not.toThrow();
    expect(() => assertArcTestnetSwapExecution("Arc_Mainnet")).toThrow(/restricted to Arc Testnet/);
    expect(() => assertArcTestnetSwapExecution("Arc")).toThrow(/restricted to Arc Testnet/);
  });

  it("continues to allow the Arc Testnet path", () => {
    expect(() => assertArcMainnetSwapAvailable(false)).not.toThrow();
  });
});
