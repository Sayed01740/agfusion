import { describe, expect, it } from "vitest";
import { assertArcMainnetSwapAvailable } from "@/blockchain/production-swap";

describe("Arc Mainnet swap execution release gate", () => {
  it("fails closed for Mainnet before wallet access or transaction preparation", () => {
    expect(() => assertArcMainnetSwapAvailable(true)).toThrow(
      /Arc Mainnet swaps are not enabled yet/,
    );
  });

  it("continues to allow the Arc Testnet path", () => {
    expect(() => assertArcMainnetSwapAvailable(false)).not.toThrow();
  });
});
