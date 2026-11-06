import { describe, expect, it } from "vitest";
import { assertArcMainnetSwapAvailable, runProductionSwap } from "@/blockchain/production-swap";

describe("Arc Mainnet swap execution release gate", () => {
  it("fails closed for Mainnet before wallet access or transaction preparation", () => {
    expect(() => assertArcMainnetSwapAvailable(true)).toThrow(
      /Arc Mainnet swaps are not enabled yet/,
    );
  });


  it.each(["Arc_Mainnet", "Arc"] as const)(
    "rejects %s before requesting a wallet provider or preparing a transaction",
    async (chain) => {
      await expect(runProductionSwap({
        amount: "1",
        tokenIn: "USDC",
        tokenOut: "EURC",
        chain,
      })).rejects.toThrow(/Arc Mainnet swaps are not enabled yet/);
    },
  );

  it("continues to allow the Arc Testnet path", () => {
    expect(() => assertArcMainnetSwapAvailable(false)).not.toThrow();
  });
});
