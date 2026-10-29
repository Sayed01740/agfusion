import { describe, expect, it } from "vitest";
import {
  assertSameCctpEnvironment,
  getCctpConfig,
  isCctpTestnetChain,
} from "@/lib/cctp-chains";

describe("CCTP network environment isolation", () => {
  it("classifies Arc Mainnet and Testnet independently", () => {
    expect(isCctpTestnetChain("Arc_Mainnet")).toBe(false);
    expect(isCctpTestnetChain(5042)).toBe(false);
    expect(isCctpTestnetChain("Arc_Testnet")).toBe(true);
    expect(isCctpTestnetChain(5042002)).toBe(true);
  });

  it("uses distinct Arc messenger addresses for Mainnet and Testnet", () => {
    const mainnet = getCctpConfig("Arc_Mainnet");
    const testnet = getCctpConfig("Arc_Testnet");

    expect(mainnet?.chainId).toBe(5042);
    expect(testnet?.chainId).toBe(5042002);
    expect(mainnet?.tokenMessenger).not.toBe(testnet?.tokenMessenger);
    expect(mainnet?.messageTransmitter).not.toBe(testnet?.messageTransmitter);
  });

  it("allows bridges within the same environment", () => {
    expect(() => assertSameCctpEnvironment("Arc_Mainnet", "Base")).not.toThrow();
    expect(() =>
      assertSameCctpEnvironment("Arc_Testnet", "Base_Sepolia"),
    ).not.toThrow();
  });

  it("rejects a Mainnet-to-Testnet or Testnet-to-Mainnet bridge", () => {
    expect(() =>
      assertSameCctpEnvironment("Arc_Mainnet", "Base_Sepolia"),
    ).toThrow("CCTP bridging between Mainnet and Testnet is not supported.");

    expect(() =>
      assertSameCctpEnvironment("Arc_Testnet", "Ethereum"),
    ).toThrow("CCTP bridging between Mainnet and Testnet is not supported.");
  });
});
