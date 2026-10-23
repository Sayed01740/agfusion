import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("network-specific Arc token selection", () => {
  it("selects the requested network registry instead of the build default", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    vi.resetModules();

    const tokens = await import("./tokens");

    expect(tokens.getToken("EURC", true).address).toBe(
      "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    );
    expect(tokens.getToken("EURC", false).address).toBe(
      "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    );
  });

  it("fails closed when a token is not registered for the requested network", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    vi.resetModules();

    const tokens = await import("./tokens");

    expect(() => tokens.getToken("UNREGISTERED", true)).toThrow(
      "Unknown token for Arc Mainnet: UNREGISTERED",
    );
  });
});
