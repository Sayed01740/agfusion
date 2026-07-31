import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { bridgeBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Live bridge requires browser wallet signature. */
export async function POST(req: Request) {
  const rl = rateLimit(`bridge:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const raw = await req.json();
    const parsed = bridgeBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "browser_wallet_required",
        message:
          "Bridge needs your wallet. Use the agent Confirm button — Rabby will open to sign.",
        hint: "Connect wallet → Confirm & open wallet to transfer",
      },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
