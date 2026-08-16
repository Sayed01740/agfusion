import { describe, expect, it } from "vitest";
import { executeTool, gateMoney, isMoneyTool } from "./tools";

describe("money authorization (Phase 4)", () => {
  it("LLM-provided confirmed=true is NOT sufficient authorization", () => {
    // A prompt-injected LLM could set confirmed: true — the application must
    // still block execution because no trusted app-level confirmation exists.
    expect(gateMoney({ confirmed: true }, undefined)).toBe(false);
    expect(gateMoney({ confirmed: "true" }, undefined)).toBe(false);
  });

  it("only trusted application confirmation authorizes", () => {
    expect(gateMoney({}, true)).toBe(true);
    expect(gateMoney({ confirmed: true }, true)).toBe(true);
    expect(gateMoney({}, false)).toBe(false);
  });

  it("execute_bridge with LLM confirmed=true but no app confirmation is blocked", async () => {
    const result = await executeTool(
      "execute_bridge",
      {
        amount: "5",
        fromChain: "Base_Sepolia",
        toChain: "Arc_Testnet",
        confirmed: true, // injected by the LLM — must be ignored
      },
      { wallet: {}, userConfirmed: false },
    );
    expect(result.ok).toBe(false);
    expect(result.needsConfirm).toBe(true);
    expect(result.summary).toMatch(/blocked|confirm/i);
  });

  it("execute_bridge passes the gate with app confirmation (then fails in node, not at the gate)", async () => {
    const result = await executeTool(
      "execute_bridge",
      {
        amount: "5",
        fromChain: "Base_Sepolia",
        toChain: "Arc_Testnet",
      },
      { wallet: {}, userConfirmed: true },
    );
    // The gate was passed: execution was attempted and failed for a browser
    // reason (no window in Node), not an authorization reason.
    expect(result.ok).toBe(false);
    expect(result.needsConfirm).toBeFalsy();
    expect(result.summary).toMatch(/browser|wallet/i);
  });

  it("money tool allowlist is exact", () => {
    expect(isMoneyTool("execute_bridge")).toBe(true);
    expect(isMoneyTool("execute_send")).toBe(true);
    expect(isMoneyTool("execute_swap")).toBe(true);
    expect(isMoneyTool("execute_route")).toBe(true);
    expect(isMoneyTool("register_erc8004_agent")).toBe(true);
    expect(isMoneyTool("get_balances")).toBe(false);
    expect(isMoneyTool("prepare_payment")).toBe(false);
    expect(isMoneyTool("not_a_real_tool")).toBe(false);
  });

  it("unknown tools are rejected", async () => {
    const result = await executeTool("not_a_real_tool", {}, { wallet: {} });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/unknown tool/i);
  });
});
