import { describe, expect, it } from "vitest";
import {
  ARC_QUOTE_SESSION_TTL_SECONDS,
  createArcUniswapQuoteSession,
  decryptArcUniswapQuoteSession,
} from "@/blockchain/uniswap-quote-session";

const secret = "test-only-session-secret-with-more-than-32-bytes";
const now = 1_800_000_000;
const input = {
  chainId: 5042 as const,
  account: "0x1111111111111111111111111111111111111111",
  tokenIn: "0x3600000000000000000000000000000000000000",
  tokenOut: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  amountIn: "1000000",
  quotedAmountOut: "900000",
  minimumAmountOut: "891000",
  quote: {
    input: { token: "0x3600000000000000000000000000000000000000", amount: "1000000" },
    output: { token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", amount: "900000", minimumAmount: "891000" },
  },
  permitData: null,
  requestId: "test-quote",
};

describe("encrypted Arc Uniswap quote sessions", () => {
  it("round-trips the quote and its wallet binding before expiry", () => {
    const created = createArcUniswapQuoteSession(input, secret, now);
    const decoded = decryptArcUniswapQuoteSession(created.token, secret, now + 10);
    expect(created.expiresAt).toBe(now + ARC_QUOTE_SESSION_TTL_SECONDS);
    expect(decoded).toMatchObject(input);
    expect(decoded.issuedAt).toBe(now);
    expect(decoded.expiresAt).toBe(created.expiresAt);
  });

  it("does not reveal quote data in the opaque token", () => {
    const created = createArcUniswapQuoteSession(input, secret, now);
    expect(created.token).not.toContain("1000000");
    expect(created.token).not.toContain("test-quote");
  });

  it("rejects tampering", () => {
    const created = createArcUniswapQuoteSession(input, secret, now);
    const altered = created.token.slice(0, -1) + (created.token.endsWith("A") ? "B" : "A");
    expect(() => decryptArcUniswapQuoteSession(altered, secret, now)).toThrow();
  });

  it("rejects a token encrypted with another secret", () => {
    const created = createArcUniswapQuoteSession(input, secret, now);
    expect(() => decryptArcUniswapQuoteSession(created.token, "different-secret-that-is-also-long-enough", now)).toThrow();
  });

  it("rejects expired sessions", () => {
    const created = createArcUniswapQuoteSession(input, secret, now);
    expect(() => decryptArcUniswapQuoteSession(created.token, secret, now + ARC_QUOTE_SESSION_TTL_SECONDS)).toThrow(/expired/);
  });

  it("rejects a missing or short secret", () => {
    expect(() => createArcUniswapQuoteSession(input, "short", now)).toThrow(/not configured/);
  });
});
