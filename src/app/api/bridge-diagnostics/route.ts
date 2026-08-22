import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256_000;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(redact);
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/private|secret|seed|mnemonic|password|token|authorization|cookie|api[_-]?key/i.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = redact(item);
      }
    }
    return output;
  }
  return String(value);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Diagnostic payload too large" }, { status: 413 });
  }

  try {
    const body = await request.json();
    const payload = redact(body);
    console.info("[AGFUSION_BRIDGE_DIAGNOSTIC]", JSON.stringify(payload));
    return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[AGFUSION_BRIDGE_DIAGNOSTIC_ERROR]", error);
    return NextResponse.json({ ok: false, error: "Invalid diagnostic payload" }, { status: 400 });
  }
}
