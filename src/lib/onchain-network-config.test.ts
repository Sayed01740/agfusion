import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("network-specific on-chain deployment metadata", () => {
  it("does not reuse Testnet registry, deployer, or deployment hash on Mainnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY", "0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOYER", "0xB00f41172c23d31571a3bE850AA0e81e58Ab8828");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOY_TX", "0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOYER_MAINNET", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOY_TX_MAINNET", "");
    vi.resetModules();

    const onchain = await import("./onchain");

    expect(onchain.AGFUSION_REGISTRY).toBe("");
    expect(onchain.AGFUSION_DEPLOYER).toBe("");
    expect(onchain.AGFUSION_DEPLOY_TX).toBe("");
  });

  it("preserves the existing Testnet metadata defaults", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOYER", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_DEPLOY_TX", "");
    vi.resetModules();

    const onchain = await import("./onchain");

    expect(onchain.AGFUSION_REGISTRY).toBe("0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483");
    expect(onchain.AGFUSION_DEPLOYER).toBe("0xB00f41172c23d31571a3bE850AA0e81e58Ab8828");
    expect(onchain.AGFUSION_DEPLOY_TX).toBe("0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99");
  });
});
