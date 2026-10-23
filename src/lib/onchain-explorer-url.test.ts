import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("network-specific explorer URLs", () => {
  it("does not generate broken explorer links when Mainnet deployment metadata is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOYER_MAINNET", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOY_TX_MAINNET", "");
    vi.resetModules();

    const onchain = await import("./onchain");

    expect(onchain.registryExplorerUrl()).toBe("");
    expect(onchain.walletExplorerUrl()).toBe("");
    expect(onchain.txExplorerUrl()).toBe("");
  });

  it("still builds links for explicitly configured addresses and hashes", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_EXPLORER_URL", "https://explorer.arc.io");
    vi.resetModules();

    const onchain = await import("./onchain");

    expect(onchain.registryExplorerUrl("0x1111111111111111111111111111111111111111")).toBe(
      "https://explorer.arc.io/address/0x1111111111111111111111111111111111111111",
    );
    expect(onchain.txExplorerUrl("0x" + "22".repeat(32))).toBe(
      `https://explorer.arc.io/tx/0x${"22".repeat(32)}`,
    );
    expect(onchain.walletExplorerUrl("0x3333333333333333333333333333333333333333")).toBe(
      "https://explorer.arc.io/address/0x3333333333333333333333333333333333333333",
    );
  });
});
