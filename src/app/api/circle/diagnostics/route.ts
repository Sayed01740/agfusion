import { NextResponse } from "next/server";
import { getServerKitKey } from "@/lib/circle-kit-server";
import { normalizeKitKey, isValidKitKeyShape } from "@/lib/kit-key";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = rateLimit(`circlediag:${clientIp(req)}`, { windowMs: 60_000, max: 30 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const raw = process.env.KIT_KEY || process.env.CIRCLE_KIT_KEY || process.env.NEXT_PUBLIC_KIT_KEY || "";
  const normalized = raw ? normalizeKitKey(raw) : "";
  const resolved = getServerKitKey();

  return NextResponse.json({
    ok: true,
    kitKey: {
      configured: Boolean(raw),
      normalizedShapeValid: Boolean(normalized) && isValidKitKeyShape(normalized),
      resolved: Boolean(resolved),
      resolvedShapeValid: Boolean(resolved) && isValidKitKeyShape(resolved),
    },
    apiKey: {
      configured: Boolean(process.env.CIRCLE_API_KEY || process.env.TEST_API_KEY),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
