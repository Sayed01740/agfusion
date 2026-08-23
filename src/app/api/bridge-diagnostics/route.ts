import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { listBridgeDiagnosticEvents, logBridgeDiagnosticEvent } from "@/lib/tx-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 256_000;

function redact(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 500)) {
      if (/private|secret|seed|mnemonic|password|authorization|cookie|access.?token|refresh.?token|api.?key/i.test(key)) out[key] = "[redacted]";
      else out[key] = redact(item);
    }
    return out;
  }
  return String(value);
}

export async function POST(request: Request) {
  const rl = rateLimit(`bridgeDiag:${clientIp(request)}`, { windowMs: 60_000, max: 300 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  try {
    const body = (await request.json()) as { sessionId?: string; event?: unknown; walletAddress?: string };
    if (!body.sessionId || !body.event) return NextResponse.json({ ok: false, error: "sessionId_and_event_required" }, { status: 400 });
    const event = redact(body.event);
    const saved = await logBridgeDiagnosticEvent(event, body.sessionId, body.walletAddress);
    console.info("[AGFUSION_BRIDGE_DIAGNOSTIC]", JSON.stringify({ sessionId: body.sessionId, event }));
    return NextResponse.json({ ok: true, saved, storage: saved ? "database" : "browser_only", receivedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[AGFUSION_BRIDGE_DIAGNOSTIC_ERROR]", error);
    return NextResponse.json({ ok: false, error: "invalid_diagnostic_payload" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const rl = rateLimit(`bridgeDiagGet:${clientIp(request)}`, { windowMs: 60_000, max: 120 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || undefined;
  const walletAddress = url.searchParams.get("walletAddress") || undefined;
  const events = await listBridgeDiagnosticEvents({ sessionId, walletAddress, limit: Number(url.searchParams.get("limit") || 2000) });
  return NextResponse.json({ ok: true, storage: events.length ? "database" : "empty_or_db_unavailable", eventCount: events.length, events });
}
