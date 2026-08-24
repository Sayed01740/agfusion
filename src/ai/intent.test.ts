import { describe, expect, it } from "vitest";
import { parseIntent } from "./intent";

describe("parseIntent", () => {
  it("parses a full Arc → Base bridge with amount and direction", () => {
    const p = parseIntent("Bridge 5 USDC from Arc to Base");
    expect(p.type).toBe("bridge");
    expect(p.amount).toBe("5");
    expect(p.token).toBe("USDC");
    expect(p.fromChain).toBe("Arc_Testnet");
    expect(p.toChain).toBe("Base_Sepolia");
  });

  it("fails closed when a bridge has no explicit source or destination", () => {
    const p = parseIntent("Bridge 10 USDC");
    expect(p.type).toBe("unknown");
    expect(p.amount).toBe("10");
    expect(p.fromChain).toBeUndefined();
    expect(p.toChain).toBeUndefined();
  });

  it("fails closed when a bridge omits its amount and route", () => {
    const p = parseIntent("Bridge USDC");
    expect(p.type).toBe("unknown");
    expect(p.amount).toBeUndefined();
    expect(p.fromChain).toBeUndefined();
    expect(p.toChain).toBeUndefined();
  });

  it("honors Arc → Base direction (never flips to Base → Arc)", () => {
    const p = parseIntent("move 20 USDC from Arc to Base");
    expect(p.type).toBe("bridge");
    expect(p.fromChain).toBe("Arc_Testnet");
    expect(p.toChain).toBe("Base_Sepolia");
  });

  it("parses swaps with token pairs without inventing a chain", () => {
    const p = parseIntent("Swap 1 USDC to EURC");
    expect(p.type).toBe("swap");
    expect(p.amount).toBe("1");
    expect(p.token).toBe("USDC");
    expect(p.tokenOut).toBe("EURC");
    expect(p.toChain).toBeUndefined();
  });

  it("fails closed when a swap omits its amount or output token", () => {
    expect(parseIntent("Swap USDC to EURC").type).toBe("unknown");
    expect(parseIntent("Swap 1 USDC").type).toBe("unknown");
  });

  it("never invents a recipient address from a name", () => {
    const p = parseIntent("Send 5 USDC to sarah");
    expect(p.type).toBe("unknown");
    expect(p.recipient).toBeUndefined();
    expect(p.recipientLabel).toBe("Sarah");
  });

  it("keeps real 0x recipient addresses", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const p = parseIntent(`Send 2 USDC to ${addr}`);
    expect(p.type).toBe("send");
    expect(p.recipient).toBe(addr);
  });

  it("does not invent a send network", () => {
    const p = parseIntent("Send 2 USDC to 0x1234567890abcdef1234567890abcdef12345678");
    expect(p.type).toBe("send");
    expect(p.toChain).toBeUndefined();
  });

  it("fails closed when a route has no real recipient", () => {
    const p = parseIntent("Move 5 USDC from Base to Arc and pay Sarah");
    expect(p.type).toBe("unknown");
    expect(p.fromChain).toBe("Base_Sepolia");
    expect(p.toChain).toBe("Arc_Testnet");
    expect(p.recipient).toBeUndefined();
  });

  it("classifies balance questions", () => {
    const p = parseIntent("Show my balances");
    expect(p.type).toBe("balance");
  });

  it("classifies casual chat as explain", () => {
    const p = parseIntent("How are you?");
    expect(p.type).toBe("explain");
  });
});
