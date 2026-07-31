import { NextResponse } from "next/server";
import { getAppConfigPublic } from "@/lib/config";

export const runtime = "nodejs";

/** Minimal public config + runtime kit key for browser App Kit */
export async function GET() {
  return NextResponse.json(getAppConfigPublic(), {
    headers: {
      // No long cache — kit key may be updated on Vercel without redeploy
      "Cache-Control": "no-store",
    },
  });
}
