import { NextResponse } from "next/server";
import { getServerKitKey } from "@/lib/circle-kit-server";
import { normalizeKitKey, isValidKitKeyShape } from "@/lib/kit-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.KIT_KEY || process.env.CIRCLE_KIT_KEY || process.env.NEXT_PUBLIC_KIT_KEY || "";
  const normalized = raw ? normalizeKitKey(raw) : "";
  const resolved = getServerKitKey();

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV || "unknown",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "unknown",
    kitKey: {
      configured: Boolean(raw),
      normalizedShapeValid: Boolean(normalized) && isValidKitKeyShape(normalized),
      resolved: Boolean(resolved),
      resolvedShapeValid: Boolean(resolved) && isValidKitKeyShape(resolved),
      length: normalized.length,
      prefix: normalized ? normalized.split(":")[0] : null,
    },
    apiKey: {
      configured: Boolean(process.env.CIRCLE_API_KEY || process.env.TEST_API_KEY),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
