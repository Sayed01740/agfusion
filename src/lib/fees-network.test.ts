import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("network-specific fee messaging", () => {
  it("warns that Mainnet fees are illustrative, not live quotes", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.resetModules();

    const fees = await import("./fees");
    for (const quote of [
      fees.quoteSendFee(),
      fees.quoteBridgeFee("10"),
      fees.quoteSwapFee("10"),
      fees.quoteX402Fee(),
      fees.quotePayrollBatchFee(2),
      fees.feeFromUsd(),
    ]) {
      expect(quote.tip).toContain("Illustrative estimate only");
      expect(quote.tip).toContain("not a live provider quote");
    }
  });

  it("preserves existing Testnet fee messaging", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    vi.resetModules();

    const fees = await import("./fees");
    expect(fees.quoteSendFee().tip).toBe(
      "Gas is a line item in USDC, not a volatile token market.",
    );
    expect(fees.quoteBridgeFee("10").tip).toBe(
      "Predictable dollar-based costs for transfer + settlement.",
    );
  });
});
