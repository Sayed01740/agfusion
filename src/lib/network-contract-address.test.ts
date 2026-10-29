import { describe, expect, it } from "vitest";
import { getNetworkContractAddress } from "@/lib/network-contract-address";

const TESTNET = "0x1111111111111111111111111111111111111111";
const MAINNET = "0x2222222222222222222222222222222222222222";

describe("getNetworkContractAddress", () => {
  it("uses the Mainnet address only when explicitly configured", () => {
    expect(getNetworkContractAddress(true, MAINNET, TESTNET)).toBe(MAINNET);
    expect(getNetworkContractAddress(true, undefined, TESTNET)).toBeUndefined();
    expect(getNetworkContractAddress(true, "", TESTNET)).toBeUndefined();
  });

  it("preserves the existing Testnet variables and legacy fallback", () => {
    expect(getNetworkContractAddress(false, MAINNET, TESTNET)).toBe(TESTNET);
    expect(getNetworkContractAddress(false, MAINNET, undefined, TESTNET)).toBe(TESTNET);
  });

  it("rejects malformed addresses", () => {
    expect(getNetworkContractAddress(true, "0x123", TESTNET)).toBeUndefined();
  });
});
