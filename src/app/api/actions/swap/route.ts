import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { swapBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Swap must run in the browser (wallet signature + App Kit).
 * This route only validates the request and tells the client to use local flow.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`swap:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const raw = await req.json();
    const parsed = swapBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "browser_wallet_required",
        message:
          "Swap needs your wallet. Use the agent Confirm button or Stablecoin FX panel — Rabby will open to sign.",
        hint: "Connect wallet → Arc Testnet → Confirm & open wallet to swap",
      },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
