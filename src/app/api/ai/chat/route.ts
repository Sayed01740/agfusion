import { NextResponse } from "next/server";
import { orchestrateUserMessage } from "@/ai/orchestrator";
import { resolveLlmConfig } from "@/lib/llm-config";

export const runtime = "nodejs";

/**
 * AI chat + action orchestration.
 * Uses local intent engine always; optionally enriches with BazaarLink / xAI
 * when a server LLM key is present.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = String(body.message || "").trim();
    const execute = Boolean(body.execute);

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    let result = await orchestrateUserMessage(message, { execute });

    const llm = resolveLlmConfig();
    if (llm && !execute) {
      try {
        const enriched = await enrichWithLlm(
          message,
          result.message.content,
          llm,
        );
        if (enriched) {
          result = {
            ...result,
            message: { ...result.message, content: enriched },
          };
        }
      } catch {
        // Keep deterministic orchestrator output
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "orchestration failed" },
      { status: 500 },
    );
  }
}

async function enrichWithLlm(
  userMessage: string,
  draft: string,
  llm: NonNullable<ReturnType<typeof resolveLlmConfig>>,
): Promise<string | null> {
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
        {
          role: "system",
          content: `You are AGFusion, a professional AI assistant for stablecoin payments, treasury, and developers on Arc (Circle's Economic OS for programmable money).
Tone: clear, concise, institutional fintech — not hype. Never invent fake transaction hashes.
Keep markdown light. Preserve any concrete numbers, routes, and action details from the draft.
Arc facts: USDC is native gas, sub-second deterministic finality, EVM-compatible, public testnet. Prefer product language (send, transfer, settle) over SDK marketing.`,
        },
        {
          role: "user",
          content: `User said: ${userMessage}\n\nDraft response to refine (keep facts):\n${draft}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : null;
}
