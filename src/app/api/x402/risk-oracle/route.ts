/**
 * Risk Oracle is temporarily unavailable while x402 payment handling is
 * disabled pending independent security review.
 *
 * Fail closed for every method: do not advertise payment requirements,
 * expose a payment recipient, verify/consume payment hashes, or unlock data.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    {
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
      message: "Risk Oracle payments are temporarily disabled pending security review.",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET() {
  return unavailable();
}

export async function POST(_req: Request) {
  return unavailable();
}
