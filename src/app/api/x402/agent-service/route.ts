import { NextResponse } from "next/server";

/**
 * x402 Agent Service is temporarily disabled pending independent security
 * review. Do not advertise a payment challenge or expose payment metadata.
 */

function unavailable() {
  return NextResponse.json(
    {
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
      message: "Agent Service payments are temporarily disabled pending security review.",
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

export async function POST(_request: Request) {
  // Never trust x-payment-tx or x-session-auth until independently verified.
  return unavailable();
}
