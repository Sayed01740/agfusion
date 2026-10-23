import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isolated Arc network configuration", () => {
  it("preserves the existing Testnet chain, RPC and CCTP addresses", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "testnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_RPC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_WS_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_EXPLORER_URL", "");
    vi.resetModules();

    const arc = await import("./arc-chain");
    const cctp = await import("./cctp-chains");
    const rpc = await import("./rpc-proxy");

    expect(arc.ARC_CHAIN_ID).toBe(5042002);
    expect(arc.ARC_NETWORK_NAME).toBe("Arc Testnet");
    expect(arc.ARC_RPC).toBe("https://rpc.testnet.arc.network");
    expect(cctp.CCTP_CHAIN_CONFIG.Arc_Testnet.tokenMessenger).toBe(
      "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    );
    expect(cctp.CCTP_CHAIN_CONFIG.Arc_Testnet.messageTransmitter).toBe(
      "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    );
    expect(rpc.EXPECTED_CHAIN_IDS.base).toBe("0x14a34");
    expect(rpc.RPC_UPSTREAMS.arc[0]).toBe("https://rpc.testnet.arc.io");
  });

  it("selects Mainnet IDs, RPCs and Circle-registered CCTP v2 contracts", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_HEX", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_RPC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_WS_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_EXPLORER_URL", "");
    vi.resetModules();

    const arc = await import("./arc-chain");
    const cctp = await import("./cctp-chains");
    const rpc = await import("./rpc-proxy");

    expect(arc.ARC_CHAIN_ID).toBe(5042);
    expect(arc.ARC_NETWORK_NAME).toBe("Arc Mainnet");
    expect(arc.ARC_RPC).toBe("https://rpc.mainnet.arc.io");
    expect(cctp.CCTP_CHAIN_CONFIG.Arc_Mainnet.tokenMessenger).toBe(
      "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    );
    expect(cctp.CCTP_CHAIN_CONFIG.Arc_Mainnet.messageTransmitter).toBe(
      "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    );
    expect(cctp.CCTP_CHAIN_CONFIG.Arc_Testnet.tokenMessenger).toBe(
      "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    );
    expect(rpc.EXPECTED_CHAIN_IDS.base).toBe("0x2105");
    expect(rpc.EXPECTED_CHAIN_IDS.eth).toBe("0x1");
    expect(rpc.EXPECTED_CHAIN_IDS.arb).toBe("0xa4b1");
    expect(rpc.EXPECTED_CHAIN_IDS.op).toBe("0xa");
    expect(rpc.RPC_UPSTREAMS.arc[0]).toBe("https://rpc.mainnet.arc.io");
  });
});
