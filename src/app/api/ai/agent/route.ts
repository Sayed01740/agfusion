import { NextResponse } from "next/server";
import { runSmartAgent } from "@/ai/agent-llm";
import type { AgentEvent } from "@/ai/agent-loop";
import { agentRateLimitConfig } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeAgentText } from "@/lib/sanitize";
import { getSessionUser } from "@/lib/session";
import { consumeConfirmationToken, issueConfirmationToken } from "@/lib/confirmation-token";
import { logAgentRun, persistTransaction } from "@/lib/tx-store";
import { agentRequestSchema } from "@/lib/validation";
import { redactToolTrace, redactTransactionForClient } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function previewAction(preview: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!preview) return {};
  const copy = { ...preview };
  delete copy.confirmToken;
  return copy;
}

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
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const body = parsed.data;
  const session = await getSessionUser();
  const wallet = { ...body.wallet, address: session?.address || body.wallet?.address || null };

  if (body.execute) {
    if (!body.confirmed || !body.confirmToken || !body.confirmationPreview) {
      return NextResponse.json({ error: "confirm_required", message: "A fresh confirmation capability and action preview are required." }, { status: 403 });
    }
    const valid = consumeConfirmationToken({
      token: body.confirmToken,
      wallet: wallet.address,
      action: { preview: previewAction(body.confirmationPreview) },
    });
    if (!valid) {
      return NextResponse.json({ error: "confirmation_mismatch", message: "Confirmation expired or does not match the reviewed action. Re-plan and confirm again." }, { status: 403 });
    }
  }

  const rlKey = body.execute ? `agent-exec:${ip}` : `agent:${ip}`;
  const rlMax = body.execute ? limits.maxExecute : limits.maxRequests;
  const rl = rateLimit(rlKey, { windowMs: limits.windowMs, max: rlMax });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let confirmationToken = body.execute ? body.confirmToken! : "";
  const wantStream = body.stream !== false;

  const scrubResult = (result: Awaited<ReturnType<typeof runSmartAgent>>) => {
    if (result.message?.content) result.message.content = sanitizeAgentText(result.message.content);
    if (result.message) {
      result.message.toolTrace = redactToolTrace(result.toolTrace) as typeof result.message.toolTrace | undefined;
      if (result.message.actionPreview && !confirmationToken) {
        confirmationToken = issueConfirmationToken({
          wallet: wallet.address,
          action: { preview: previewAction(result.message.actionPreview as unknown as Record<string, unknown>) },
        });
      }
      if (result.message.actionPreview && confirmationToken) {
        result.message.actionPreview = { ...result.message.actionPreview, confirmToken: confirmationToken };
      }
    }
    if (result.transaction) {
      result.transaction = redactTransactionForClient(result.transaction as unknown as Record<string, unknown>) as typeof result.transaction;
    }
    return { message: result.message, transaction: result.transaction, toolTrace: redactToolTrace(result.toolTrace) };
  };

  const persistAndLog = async (result: Awaited<ReturnType<typeof runSmartAgent>>) => {
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
  };

  if (!wantStream) {
    try {
      const result = await runSmartAgent({ message: body.message, execute: body.execute && body.confirmed, wallet });
      await persistAndLog(result);
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
        if (event.type === "status") out = { type: "status", message: sanitizeAgentText(String(event.message || "")).slice(0, 120) };
        if (event.type === "tool") out = { type: "tool", name: event.name, ok: event.ok };
        if (event.type === "confirm") {
          confirmationToken = issueConfirmationToken({ wallet: wallet.address, action: { preview: previewAction(event.preview as unknown as Record<string, unknown>) } });
          out = { type: "confirm", preview: { ...event.preview, confirmToken: confirmationToken } };
        }
        if (event.type === "message") {
          out = { type: "message", content: sanitizeAgentText(String(event.content || "")), actionPreview: event.actionPreview ? { ...event.actionPreview, ...(confirmationToken ? { confirmToken: confirmationToken } : {}) } : undefined };
        }
        if (event.type === "transaction" && event.transaction) out = { type: "transaction", transaction: redactTransactionForClient(event.transaction as unknown as Record<string, unknown>) };
        if (event.type === "done") {
          out = {
            type: "done",
            message: event.message ? {
              ...event.message,
              content: sanitizeAgentText(event.message.content),
              actionPreview: event.message.actionPreview ? { ...event.message.actionPreview, ...(confirmationToken ? { confirmToken: confirmationToken } : {}) } : undefined,
              toolTrace: redactToolTrace(event.message.toolTrace as Array<{ name: string; summary: string; ok: boolean }> | undefined),
            } : undefined,
            transaction: event.transaction ? redactTransactionForClient(event.transaction as unknown as Record<string, unknown>) : undefined,
          };
        }
        if (event.type === "error") out = { type: "error", message: "Something went wrong. Try again." };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
      };

      try {
        send({ type: "status", message: "Working…" });
        const result = await runSmartAgent({ message: body.message, execute: body.execute && body.confirmed, wallet, onEvent: (e) => send(e) });
        await persistAndLog(result);
      } catch {
        send({ type: "error", message: "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
