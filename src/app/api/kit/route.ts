/**
 * Circle Kit key health endpoint.
 *
 * The Kit credential is server-only. Swap preparation now happens on the
 * server, so there is no reason for a browser client to receive KIT_KEY.
 */

import { NextResponse } from "next/server";
import { getServerKitKey, kitKeyHint, verifyKitKeyWithCircle } from "@/lib/circle-kit-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const check = url.searchParams.get("check") === "1";
  const rl = rateLimit(`kit:${clientIp(req)}`, { windowMs: 60_000, max: check ? 15 : 60 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const kitKey = getServerKitKey();
  if (!kitKey) {
    return NextResponse.json({
      kitKey: null,
      configured: false,
      valid: false,
      message: "No server-side Circle KIT_KEY is configured.",
      fix: [
        "Create a Kit key in Circle Console → Keys → Kit keys.",
        "Set KIT_KEY on Vercel as a server-only environment variable.",
        "Do not set NEXT_PUBLIC_KIT_KEY.",
        "Redeploy production.",
      ],
    }, { headers: { "Cache-Control": "no-store" } });
  }

  let valid: boolean | null = null;
  let verifyMessage: string | undefined;
  let verifyStatus: number | undefined;
  if (check) {
    const result = await verifyKitKeyWithCircle(kitKey);
    valid = result.ok;
    verifyMessage = result.message;
    verifyStatus = result.status;
  }

  return NextResponse.json({
    kitKey: null,
    configured: true,
    valid,
    hint: kitKeyHint(kitKey),
    message: valid === false ? verifyMessage || "Circle rejected the configured Kit key." : valid === true ? "Kit key accepted by Circle." : "Kit key configured on server.",
    verifyStatus,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
