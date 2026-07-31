/**
 * Kit key bootstrap + health for browser App Kit.
 *
 * Permanent model:
 * - Owner sets KIT_KEY once on Vercel (valid key from Circle console)
 * - This route serves it to the browser for App Kit config.kitKey
 * - /api/circle/proxy injects the same key on every Circle HTTP call
 * - Users never paste a key
 */

import { NextResponse } from "next/server";
import {
  getServerKitKey,
  kitKeyHint,
  verifyKitKeyWithCircle,
} from "@/lib/circle-kit-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const check = url.searchParams.get("check") === "1";

  const rl = rateLimit(`kit:${clientIp(req)}`, {
    windowMs: 60_000,
    max: check ? 15 : 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const kitKey = getServerKitKey();
  if (!kitKey) {
    return NextResponse.json(
      {
        kitKey: null,
        configured: false,
        valid: false,
        message:
          "No KIT_KEY on server. Set Vercel env KIT_KEY=KIT_KEY:id:secret from console.circle.com → Keys → Kit keys, then redeploy.",
        fix: [
          "1. Open https://console.circle.com → Keys → Kit keys",
          "2. Create a new Kit key (not Management key)",
          "3. Vercel → agfusion → Settings → Environment Variables",
          "4. Set KIT_KEY and NEXT_PUBLIC_KIT_KEY to the full value KIT_KEY:…:…",
          "5. Redeploy production",
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let valid: boolean | null = null;
  let verifyMessage: string | undefined;
  let verifyStatus: number | undefined;

  if (check) {
    const v = await verifyKitKeyWithCircle(kitKey);
    valid = v.ok;
    verifyMessage = v.message;
    verifyStatus = v.status;
  }

  // Only return the raw key when configured; health-only callers use ?check=1
  // and still get kitKey so App Kit can run after a successful check.
  return NextResponse.json(
    {
      kitKey: valid === false ? null : kitKey,
      configured: true,
      valid,
      hint: kitKeyHint(kitKey),
      message:
        valid === false
          ? verifyMessage ||
            "Circle rejected KIT_KEY. Create a new Kit key and update Vercel."
          : valid === true
            ? "Kit key accepted by Circle"
            : "Kit key loaded (not live-checked; use ?check=1)",
      verifyStatus,
      fix:
        valid === false
          ? [
              "Your KIT_KEY format may be fine, but Circle returns Invalid credentials.",
              "Create a NEW Kit key at console.circle.com → Keys → Kit keys",
              "Replace KIT_KEY + NEXT_PUBLIC_KIT_KEY on Vercel (full string, no quotes/spaces)",
              "Redeploy, then hard-refresh the app",
            ]
          : undefined,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
