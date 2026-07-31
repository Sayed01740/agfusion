/**
 * Anthropic Messages API client (Claude).
 * Used for AGFusion agent tool-calling and help/onboarding.
 */

import type { LlmConfig } from "@/lib/llm-config";
import { AGENT_TOOL_DEFINITIONS } from "@/ai/tools";

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

export type ClaudeResponse =
  | {
      ok: true;
      model: string;
      stopReason: string | null;
      text: string;
      toolUses: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
      rawContent: ClaudeContentBlock[];
    }
  | { ok: false; status: number; body: string };

/** Convert OpenAI-style tool defs → Anthropic tools */
export function anthropicToolsFromAgentDefs() {
  return AGENT_TOOL_DEFINITIONS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: (t.function.parameters || {
      type: "object",
      properties: {},
    }) as Record<string, unknown>,
  }));
}

export async function anthropicMessages(
  llm: LlmConfig,
  opts: {
    model: string;
    system: string;
    messages: ClaudeMessage[];
    maxTokens?: number;
    temperature?: number;
    /** Include AGFusion money tools */
    withTools?: boolean;
  },
): Promise<ClaudeResponse> {
  const url = `${llm.baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.withTools) {
    body.tools = anthropicToolsFromAgentDefs();
  }

  // Official Anthropic: x-api-key. Also try Bearer for custom gateways.
  const preferred = llm.authStyle || "x-api-key";
  const styles: Array<"bearer" | "x-api-key" | "both"> =
    preferred === "both"
      ? ["bearer", "x-api-key", "both"]
      : preferred === "bearer"
        ? ["bearer", "both", "x-api-key"]
        : ["x-api-key", "both", "bearer"];

  let lastFail: { status: number; body: string } | null = null;

  for (const style of styles) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version":
        llm.extraHeaders?.["anthropic-version"] || "2023-06-01",
    };
    if (style === "x-api-key" || style === "both") {
      headers["x-api-key"] = llm.apiKey;
    }
    if (style === "bearer" || style === "both") {
      headers.Authorization = `Bearer ${llm.apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const rawText = await res.text().catch(() => "");

    if (!res.ok) {
      lastFail = { status: res.status, body: rawText.slice(0, 400) };
      // Only rotate auth style on 401/403
      if (res.status === 401 || res.status === 403) continue;
      return { ok: false, status: res.status, body: rawText.slice(0, 400) };
    }

    // Gateways sometimes return HTML (WAF / login page) with 200 — treat as fail
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.startsWith("<") || trimmed.startsWith("<!")) {
      lastFail = {
        status: 502,
        body: `non_json_response: ${trimmed.slice(0, 120)}`,
      };
      continue;
    }

    let data: {
      model?: string;
      stop_reason?: string;
      content?: ClaudeContentBlock[];
      error?: unknown;
    };
    try {
      data = JSON.parse(trimmed) as typeof data;
    } catch {
      lastFail = {
        status: 502,
        body: `invalid_json: ${trimmed.slice(0, 120)}`,
      };
      continue;
    }

    if (data.error) {
      lastFail = {
        status: 502,
        body: JSON.stringify(data.error).slice(0, 200),
      };
      continue;
    }

    const content = Array.isArray(data.content) ? data.content : [];
    const text = content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const toolUses = content
      .filter(
        (b): b is {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        } => b.type === "tool_use",
      )
      .map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input || {},
      }));

    return {
      ok: true,
      model: data.model || opts.model,
      stopReason: data.stop_reason || null,
      text,
      toolUses,
      rawContent: content,
    };
  }

  return {
    ok: false,
    status: lastFail?.status || 401,
    body: lastFail?.body || "auth_failed_all_styles",
  };
}

export const HELP_SYSTEM = `You are the AGFusion product guide — a friendly onboarding coach for first-time users.

AGFusion is a free **testnet** app (not a bank, not real cash) on **Arc Testnet** (chain id 5042002).
Users connect a browser wallet (Rabby recommended), get free test USDC from https://faucet.circle.com (select Arc Testnet), then:

1. **Send USDC** — Payment Engine / "Send USDC" panel: paste a full 0x address (42 chars), amount, Confirm, sign in wallet.
2. **Swap** — USDC ↔ EURC on Arc (Stablecoin FX panel or chat "Swap 1 USDC to EURC").
3. **Bridge** — Move USDC Arc ↔ Base (Cross-chain panel or chat).
4. **Chat agent** — Type plain English; agent plans; **nothing moves until Confirm + wallet signature**.
5. **Unified Balance** — Deposit from Base/ETH Sepolia, spend on Arc (advanced).
6. **Agents page** — Optional ERC-8004 on-chain identity registration.
7. **Risk oracle** — Free assess, or pay 0.001 USDC x402 micropayment for paid assess.

Rules:
- Use simple language. Avoid unexplained jargon (or define it in one short phrase).
- Give step-by-step answers (1, 2, 3).
- Never ask for seed phrases or private keys.
- Never invent balances or transaction hashes.
- If they are lost: point them to the yellow **"New here? What is this app?"** card on the dashboard right side.
- Keep answers under ~180 words unless they ask for detail.
- Live app: https://agfusion.vercel.app

You are only helping them understand and use AGFusion — not executing money.`;

export const AGENT_SYSTEM = `You are AGFusion Agent — a helpful AI agent for stablecoin finance on Arc Network (Circle).

You behave like a normal conversational agent: answer questions clearly, explain concepts, and help the user get things done.

Rules:
1. For general questions (what is Arc, how fees work, help, math, explanations): answer directly in natural language. Tools are optional.
2. For money actions (send, swap, bridge, balances): use tools. Never invent transaction hashes or balances.
3. Before money plans: get_wallet_state / get_balances when useful; estimate_* before prepare_payment.
4. NEVER call execute_* with confirmed=true unless the user already confirmed (flag will be set).
5. For first-turn money requests: estimate → prepare_payment, then stop and wait for confirm.
6. Arc Testnet chain id 5042002; gas is USDC.
7. Keep answers concise with light markdown.
8. If the user is confused about the UI, explain in plain English and point to Connect → faucet → Send USDC or the "New here?" guide.
9. Max 6 tool rounds.`;
