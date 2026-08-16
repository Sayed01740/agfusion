import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCircleApiKey,
  isValidUserToken,
} from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Look up the transaction hash for an exact Circle challenge.
 *
 * Matches on the challenge id (returned by the contract-execution route) so an
 * approval is never mistaken for the burn. A `since` timestamp is accepted as a
 * secondary guard only, never as the primary match key.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`circle-txs:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { userToken?: unknown; walletId?: unknown; challengeId?: unknown; since?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidUserToken(body.userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }
  if (typeof body.walletId !== "string" || !body.walletId.trim()) {
    return NextResponse.json({ error: "invalid_wallet_id" }, { status: 400 });
  }
  if (
    body.challengeId !== undefined &&
    (typeof body.challengeId !== "string" || body.challengeId.length > 200)
  ) {
    return NextResponse.json({ error: "invalid_challenge_id" }, { status: 400 });
  }
  if (
    body.since !== undefined &&
    (typeof body.since !== "number" || !Number.isFinite(body.since))
  ) {
    return NextResponse.json({ error: "invalid_since" }, { status: 400 });
  }

  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Circle transaction lookup is unavailable." }, { status: 500 });
  }

  const challengeId = body.challengeId as string | undefined;

  const response = await fetch(
    `https://api.circle.com/v1/w3s/transactions?walletIds=${encodeURIComponent(String(body.walletId))}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, "X-User-Token": body.userToken },
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json({ error: data?.message || "Could not read Circle transactions." }, { status: response.status });
  }

  const list = data?.data?.transactions || [];
  const after = Number(body.since || 0);

  if (challengeId) {
    // Preferred path: exact challenge match. Circle transaction records carry
    // the challengeId used to approve them; we never select by time window.
    const exact = list.find(
      (item: { challengeId?: string; txHash?: string; state?: string }) =>
        item.challengeId != null && String(item.challengeId) === String(challengeId),
    );
    if (exact?.txHash) {
      return NextResponse.json({ txHash: exact.txHash, challengeId, walletId: body.walletId });
    }
    if (exact) {
      // Challenge exists but has no hash yet — keep polling unless failed.
      if (exact.state === "FAILED") {
        return NextResponse.json({ error: "challenge_failed", message: "Circle transaction failed." }, { status: 422 });
      }
      return NextResponse.json({ txHash: null, challengeId, walletId: body.walletId });
    }
    // Challenge not in the list yet — keep polling.
    return NextResponse.json({ txHash: null, challengeId, walletId: body.walletId });
  }

  // Fallback (no challengeId): only return a hash when there is exactly one
  // new tx after `since` — never "the first tx in the window".
  const candidates = (list as Array<{ txHash?: string; createDate?: string }>).filter(
    (item) => item.txHash && new Date(item.createDate || 0).getTime() >= after - 5_000,
  );
  if (candidates.length === 1) {
    return NextResponse.json({ txHash: candidates[0].txHash, walletId: body.walletId });
  }
  return NextResponse.json({ txHash: null, walletId: body.walletId });
}
