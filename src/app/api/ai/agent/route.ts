import { NextResponse } from "next/server";
import { runSmartAgent } from "@/ai/agent-llm";
import type { AgentEvent } from "@/ai/agent-loop";
import { agentRateLimitConfig } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeAgentText } from "@/lib/sanitize";
import { getSessionUser } from "@/lib/session";
import { logAgentRun, persistTransaction } from "@/lib/tx-store";
import { agentRequestSchema } from "@/lib/validation";
import {
  redactToolTrace,
  redactTransactionForClient,
} from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limits = agentRateLimitConfig();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = agentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // Do not return zod flatten (can leak schema details)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const body = parsed.data;

  if (body.execute && !body.confirmed) {
    return NextResponse.json(
      { error: "confirm_required", message: "Confirmation required." },
      { status: 403 },
    );
  }

  const rlKey = body.execute ? `agent-exec:${ip}` : `agent:${ip}`;
  const rlMax = body.execute ? limits.maxExecute : limits.maxRequests;
  const rl = rateLimit(rlKey, {
    windowMs: limits.windowMs,
    max: rlMax,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const session = await getSessionUser();
  const wallet = {
    ...body.wallet,
    address: session?.address || body.wallet?.address || null,
  };

  const wantStream = body.stream !== false;

  const scrubResult = (result: Awaited<ReturnType<typeof runSmartAgent>>) => {
    if (result.message?.content) {
      result.message.content = sanitizeAgentText(result.message.content);
    }
    if (result.message) {
      result.message.toolTrace = redactToolTrace(result.toolTrace) as
        | typeof result.message.toolTrace
        | undefined;
    }
    if (result.transaction) {
      result.transaction = redactTransactionForClient(
        result.transaction as unknown as Record<string, unknown>,
      ) as typeof result.transaction;
    }
    // Don't send full toolTrace array with summaries on root
    return {
      message: result.message,
      transaction: result.transaction,
      toolTrace: redactToolTrace(result.toolTrace),
    };
  };

  if (!wantStream) {
    try {
      const result = await runSmartAgent({
        message: body.message,
        execute: body.execute && body.confirmed,
        wallet,
      });
      if (result.transaction) {
        await persistTransaction(result.transaction, {
          userId: session?.id !== "ephemeral" ? session?.id : undefined,
          walletAddress: wallet.address || undefined,
        });
      }
      await logAgentRun({
        message: body.message.slice(0, 200),
        execute: body.execute,
        confirmed: body.confirmed,
        ip,
        walletAddress: wallet.address || undefined,
        userId: session?.id !== "ephemeral" ? session?.id : undefined,
        toolTrace: result.toolTrace?.map((t) => t.name),
        resultSummary: undefined,
      });
      return Response.json(scrubResult(result));
    } catch {
      return NextResponse.json({ error: "agent_failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent | { type: "error"; message: string }) => {
        let out: Record<string, unknown> = { ...event };

        if (event.type === "status") {
          // Keep status high-level only
          out = {
            type: "status",
            message: sanitizeAgentText(String(event.message || "")).slice(
              0,
              120,
            ),
          };
        }
        if (event.type === "tool") {
          out = {
            type: "tool",
            name: event.name,
            ok: event.ok,
            // omit summary (addresses / internal detail)
          };
        }
        if (event.type === "message") {
          out = {
            type: "message",
            content: sanitizeAgentText(String(event.content || "")),
            actionPreview: event.actionPreview,
          };
        }
        if (event.type === "transaction" && event.transaction) {
          out = {
            type: "transaction",
            transaction: redactTransactionForClient(
              event.transaction as unknown as Record<string, unknown>,
            ),
          };
        }
        if (event.type === "done") {
          out = {
            type: "done",
            message: event.message
              ? {
                  ...event.message,
                  content: sanitizeAgentText(event.message.content),
                  toolTrace: redactToolTrace(
                    event.message.toolTrace as
                      | Array<{ name: string; summary: string; ok: boolean }>
                      | undefined,
                  ),
                }
              : undefined,
            transaction: event.transaction
              ? redactTransactionForClient(
                  event.transaction as unknown as Record<string, unknown>,
                )
              : undefined,
          };
        }
        if (event.type === "error") {
          out = { type: "error", message: "Something went wrong. Try again." };
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(out)}\n\n`),
        );
      };

      try {
        send({ type: "status", message: "Working…" });
        const result = await runSmartAgent({
          message: body.message,
          execute: body.execute && body.confirmed,
          wallet,
          onEvent: (e) => send(e),
        });
        if (result.transaction) {
          await persistTransaction(result.transaction, {
            userId: session?.id !== "ephemeral" ? session?.id : undefined,
            walletAddress: wallet.address || undefined,
          });
        }
        await logAgentRun({
          message: body.message.slice(0, 200),
          execute: body.execute,
          confirmed: body.confirmed,
          ip,
          walletAddress: wallet.address || undefined,
          userId: session?.id !== "ephemeral" ? session?.id : undefined,
          toolTrace: result.toolTrace?.map((t) => t.name),
        });
      } catch {
        send({ type: "error", message: "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
