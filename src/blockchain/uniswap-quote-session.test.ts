import { describe, expect, it } from "vitest";
import {
  ARC_QUOTE_SESSION_TTL_SECONDS,
  createArcUniswapQuoteSession,
  decryptArcUniswapQuoteSession,
  createArcUniswapReceiptTicket,
  decryptArcUniswapReceiptTicket,
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
    const parts = created.token.split(".");
    const ciphertext = parts[2];
    parts[2] = (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);
    const altered = parts.join(".");
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


  it("creates an encrypted receipt ticket that remains valid beyond the quote TTL", () => {
    const receipt = createArcUniswapReceiptTicket({
      chainId: 5042,
      account: input.account,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      minimumAmountOut: input.minimumAmountOut,
    }, secret, now);
    const decoded = decryptArcUniswapReceiptTicket(receipt.token, secret, now + 3600);
    expect(receipt.expiresAt).toBe(now + 86400);
    expect(decoded).toMatchObject({
      purpose: "receipt-verification",
      chainId: 5042,
      account: input.account,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      minimumAmountOut: input.minimumAmountOut,
    });
  });

  it("rejects receipt tickets after their 24-hour expiry", () => {
    const receipt = createArcUniswapReceiptTicket({
      chainId: 5042,
      account: input.account,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      minimumAmountOut: input.minimumAmountOut,
    }, secret, now);
    expect(() => decryptArcUniswapReceiptTicket(receipt.token, secret, now + 86400)).toThrow(/expired/);
  });

  it("rejects a missing or short secret", () => {
    expect(() => createArcUniswapQuoteSession(input, "short", now)).toThrow(/not configured/);
  });
});
