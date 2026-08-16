import { NextResponse } from "next/server";

/**
 * Look up the transaction hash for an exact Circle challenge.
 *
 * Matches on the challenge id (returned by the contract-execution route) so an
 * approval is never mistaken for the burn. A `since` timestamp is accepted as a
 * secondary guard only, never as the primary match key.
 */
export async function POST(req: Request) {
  try {
    const { userToken, walletId, challengeId, since } = await req.json();
    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    if (!userToken || !walletId || !apiKey) {
      return NextResponse.json({ error: "Circle transaction lookup is unavailable." }, { status: 400 });
    }

    const response = await fetch(
      `https://api.circle.com/v1/w3s/transactions?walletIds=${encodeURIComponent(walletId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, "X-User-Token": userToken },
        cache: "no-store",
      },
    );
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.message || "Could not read Circle transactions." }, { status: response.status });
    }

    const list = data?.data?.transactions || [];
    const after = Number(since || 0);

    if (challengeId) {
      // Preferred path: exact challenge match. Circle transaction records carry
      // the challengeId used to approve them; we never select by time window.
      const exact = list.find(
        (item: { challengeId?: string; txHash?: string; state?: string }) =>
          item.challengeId != null && String(item.challengeId) === String(challengeId),
      );
      if (exact?.txHash) {
        return NextResponse.json({ txHash: exact.txHash, challengeId, walletId });
      }
      if (exact) {
        // Challenge exists but has no hash yet — keep polling unless failed.
        if (exact.state === "FAILED") {
          return NextResponse.json({ error: "challenge_failed", message: "Circle transaction failed." }, { status: 422 });
        }
        return NextResponse.json({ txHash: null, challengeId, walletId });
      }
      // Challenge not in the list yet — keep polling.
      return NextResponse.json({ txHash: null, challengeId, walletId });
    }

    // Fallback (no challengeId): only return a hash when there is exactly one
    // new tx after `since` — never "the first tx in the window".
    const candidates = (list as Array<{ txHash?: string; createDate?: string }>).filter(
      (item) => item.txHash && new Date(item.createDate || 0).getTime() >= after - 5_000,
    );
    if (candidates.length === 1) {
      return NextResponse.json({ txHash: candidates[0].txHash, walletId });
    }
    return NextResponse.json({ txHash: null, walletId });
  } catch (error) {
    console.error("[Circle PW] Transaction lookup error:", error);
    return NextResponse.json({ error: "Could not look up the Circle transaction." }, { status: 500 });
  }
}
