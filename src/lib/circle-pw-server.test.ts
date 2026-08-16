import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  circleBlockchainForChainId,
  fetchOwnedWallet,
  isValidBlockchain,
  isValidEthereumAddress,
  isValidHexData,
  isValidUserToken,
  isValidValue,
} from "./circle-pw-server";

const OWNED_WALLET = "wallet-abc-123";
const OTHER_WALLET = "wallet-other-999";

afterEach(() => {
  delete process.env.CIRCLE_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("circle-pw-server validators (Phase 3)", () => {
  it("validates EVM addresses", () => {
    expect(isValidEthereumAddress("0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA")).toBe(true);
    expect(isValidEthereumAddress("0x123")).toBe(false);
    expect(isValidEthereumAddress("not-an-address")).toBe(false);
    expect(isValidEthereumAddress(42)).toBe(false);
  });

  it("validates hex call data", () => {
    expect(isValidHexData("0x")).toBe(true);
    expect(isValidHexData("0x70a08231")).toBe(true);
    expect(isValidHexData("0x123")).toBe(false); // odd length
    expect(isValidHexData("70a08231")).toBe(false); // no 0x prefix
    expect(isValidHexData("0xGG")).toBe(false); // non-hex
    expect(isValidHexData("0x" + "ab".repeat(60_000))).toBe(false); // oversized
  });

  it("validates transaction values", () => {
    expect(isValidValue(undefined)).toBe(true);
    expect(isValidValue("0x0")).toBe(true);
    expect(isValidValue("0")).toBe(true);
    expect(isValidValue("1000000")).toBe(true);
    expect(isValidValue("0xde0b6b3a7640000")).toBe(true);
    expect(isValidValue("-5")).toBe(false);
    expect(isValidValue("abc")).toBe(false);
  });

  it("validates blockchains and user tokens", () => {
    expect(isValidBlockchain("ARC-TESTNET")).toBe(true);
    expect(isValidBlockchain("BASE-SEPOLIA")).toBe(true);
    expect(isValidBlockchain("ETHEREUM-SEPOLIA")).toBe(false);
    expect(isValidUserToken("0123456789abcdef")).toBe(true);
    expect(isValidUserToken("short")).toBe(false);
    expect(isValidUserToken(42)).toBe(false);
  });

  it("maps chain ids to Circle blockchains (only supported chains)", () => {
    expect(circleBlockchainForChainId(5042002)).toBe("ARC-TESTNET");
    expect(circleBlockchainForChainId(84532)).toBe("BASE-SEPOLIA");
    expect(circleBlockchainForChainId(11155111)).toBeNull();
    expect(circleBlockchainForChainId(57054)).toBeNull();
  });
});

describe("fetchOwnedWallet (acceptance: no cross-user wallet execution)", () => {
  beforeEach(() => {
    process.env.CIRCLE_API_KEY = "test-circle-api-key";
  });

  it("accepts a wallet owned by the Circle user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            wallets: [
              { id: OWNED_WALLET, blockchain: "ARC-TESTNET" },
              { id: OTHER_WALLET, blockchain: "BASE-SEPOLIA" },
            ],
          },
        }),
      })),
    );
    const r = await fetchOwnedWallet("user-token-12345678", OWNED_WALLET);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wallet.blockchain).toBe("ARC-TESTNET");
  });

  it("rejects a wallet that does not belong to the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { wallets: [{ id: OWNED_WALLET }] } }),
      })),
    );
    const r = await fetchOwnedWallet("user-token-12345678", OTHER_WALLET);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/does not belong/i);
      expect(r.status).toBe(403);
    }
  });

  it("fails closed when Circle API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: "boom" }),
      })),
    );
    const r = await fetchOwnedWallet("user-token-12345678", OWNED_WALLET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });
});
