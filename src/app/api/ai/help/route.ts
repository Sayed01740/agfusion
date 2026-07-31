/**
 * LLM help / onboarding answers (HCNSEC OpenAI-compat, Anthropic, fallbacks).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { listLlmConfigs, type LlmConfig } from "@/lib/llm-config";
import { HELP_SYSTEM, anthropicMessages } from "@/lib/claude-client";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeAgentText } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.string().max(500).optional(),
});

const LOCAL_HELP = [
  "**Quick start:**",
  "",
  "1. Click **Connect** (top right) → Rabby → **Arc Testnet**",
  "2. Free test USDC: https://faucet.circle.com (select Arc Testnet)",
  "3. Right side → **Send USDC** → `0.05` → full `0x` address → Confirm",
  "",
  "Open the yellow **“New here? What is this app?”** card for more.",
].join("\n");

async function helpWithProvider(
  llm: LlmConfig,
  userMsg: string,
): Promise<
  | { ok: true; provider: string; model: string; answer: string }
  | { ok: false; status: number; message: string }
> {
  if (llm.provider === "anthropic") {
    let lastErr = "";
    for (const model of llm.modelFallbacks) {
      const result = await anthropicMessages(llm, {
        model,
        system: HELP_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
        withTools: false,
        temperature: 0.4,
        maxTokens: 1024,
      });
      if (result.ok && result.text) {
        return {
          ok: true,
          provider: llm.provider,
          model: result.model,
          answer: sanitizeAgentText(result.text),
        };
      }
      lastErr = result.ok ? "empty" : `${result.status} ${result.body}`;
      if (result.ok === false && result.status === 401) {
        return {
          ok: false,
          status: 401,
          message: "invalid Anthropic key — use sk-ant-… from console.anthropic.com",
        };
      }
    }
    return { ok: false, status: 502, message: lastErr.slice(0, 240) };
  }

  // HCNSEC / BazaarLink / xAI — OpenAI chat completions
  const res = await fetch(llm.chatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      "Content-Type": "application/json",
      ...(llm.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.4,
      messages: [
        { role: "system", content: HELP_SYSTEM },
        { role: "user", content: userMsg },
      ],
    }),
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: raw.slice(0, 240),
    };
  }
  if (!raw.trim() || raw.trim().startsWith("<")) {
    return {
      ok: false,
      status: 502,
      message: `non_json_from_${llm.provider}`,
    };
  }
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return {
      ok: false,
      status: 502,
      message: `invalid_json_from_${llm.provider}`,
    };
  }
  const answer = data?.choices?.[0]?.message?.content || "";
  return {
    ok: true,
    provider: llm.provider,
    model: llm.model,
    answer: sanitizeAgentText(String(answer)),
  };
}

export async function POST(req: Request) {
  const rl = rateLimit(`ai-help:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 40,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const providers = listLlmConfigs();
  if (!providers.length) {
    return NextResponse.json({
      ok: true,
      provider: "local",
      answer: LOCAL_HELP,
    });
  }

  const userMsg = parsed.data.context
    ? `${parsed.data.message}\n\n[UI context: ${parsed.data.context}]`
    : parsed.data.message;

  const errors: string[] = [];
  try {
    for (const llm of providers) {
      const result = await helpWithProvider(llm, userMsg);
      if (result.ok) {
        return NextResponse.json({
          ok: true,
          provider: result.provider,
          model: result.model,
          answer: result.answer,
        });
      }
      errors.push(`${llm.provider}:${result.status} ${result.message}`);
    }

    return NextResponse.json({
      ok: true,
      provider: "local",
      answer: LOCAL_HELP,
      note: "Smart AI offline. Showing built-in guide.",
      message: errors.join(" | ").slice(0, 400),
      hint:
        "Vercel Production: set HCNSEC_API_KEY, HCNSEC_BASE_URL=https://api.hcnsec.cn, HCNSEC_MODEL=<model-id from your provider>, then Redeploy.",
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      provider: "local",
      answer: LOCAL_HELP,
      note: "Smart AI unavailable; showing built-in guide.",
      message: e instanceof Error ? e.message : "unknown",
    });
  }
}
