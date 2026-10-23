import { describe, expect, it } from "vitest";
import {
  assertMainnetSwapReady,
  MAINNET_SWAP_NOT_READY_MESSAGE,
  MAINNET_SWAP_READINESS,
} from "@/lib/mainnet-swap-readiness";

describe("Arc Mainnet swap readiness gate", () => {
  it("keeps the live quote and settlement requirements disabled until verified", () => {
    expect(MAINNET_SWAP_READINESS.liveQuoteProviderConfigured).toBe(false);
    expect(MAINNET_SWAP_READINESS.settlementContractVerified).toBe(false);
    expect(() => assertMainnetSwapReady(true)).toThrow(
      MAINNET_SWAP_NOT_READY_MESSAGE,
    );
  });

  it("does not change the existing Testnet swap path", () => {
    expect(() => assertMainnetSwapReady(false)).not.toThrow();
  });
});
