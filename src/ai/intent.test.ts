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

  it("defaults to Base → Arc when no chains are named", () => {
    const p = parseIntent("Bridge 10 USDC");
    expect(p.fromChain).toBe("Base_Sepolia");
    expect(p.toChain).toBe("Arc_Testnet");
  });

  it("honors Arc → Base direction (never flips to Base → Arc)", () => {
    const p = parseIntent("move 20 USDC from Arc to Base");
    expect(p.fromChain).toBe("Arc_Testnet");
    expect(p.toChain).toBe("Base_Sepolia");
  });

  it("parses swaps with token pairs", () => {
    const p = parseIntent("Swap 1 USDC to EURC");
    expect(p.type).toBe("swap");
    expect(p.amount).toBe("1");
    expect(p.token).toBe("USDC");
    expect(p.tokenOut).toBe("EURC");
    expect(p.toChain).toBe("Arc_Testnet");
  });

  it("never invents a recipient address from a name", () => {
    const p = parseIntent("Send 5 USDC to sarah");
    expect(p.type).toBe("send");
    expect(p.recipient).toBeUndefined();
    expect(p.recipientLabel).toBe("Sarah");
  });

  it("keeps real 0x recipient addresses", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const p = parseIntent(`Send 2 USDC to ${addr}`);
    expect(p.recipient).toBe(addr);
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
