import { NextResponse } from "next/server";
import { z } from "zod";
import { orchestrateUserMessage } from "@/ai/orchestrator";
import { resolveLlmConfig } from "@/lib/llm-config";
import { readLimitedJson } from "@/lib/read-limited-json";
import { sanitizeAgentText } from "@/lib/sanitize";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  execute: z.boolean().optional(),
});

/**
 * AI chat + action orchestration.
 * Uses local intent engine always; optionally enriches with BazaarLink / xAI
 * when a server LLM key is present.
 */
export async function POST(req: Request) {
  const limited = await readLimitedJson(req, 16 * 1024);
  if (!limited.ok) {
    return NextResponse.json({ error: limited.error }, { status: limited.status });
  }

  const parsed = bodySchema.safeParse(limited.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const message = parsed.data.message;
    const execute = parsed.data.execute ?? false;
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
          // LLM text is rendered client-side via dangerouslySetInnerHTML —
          // always sanitize before returning it.
          result = {
            ...result,
            message: {
              ...result.message,
              content: sanitizeAgentText(enriched),
            },
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
