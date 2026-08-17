import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCircleApiKey,
  isValidUserToken,
} from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the transaction created by an exact Circle challenge.
 *
 * Circle's transaction records do not expose the Web SDK challengeId as a
 * transaction field. The authoritative linkage is the challenge resource's
 * correlationIds. For transaction-producing challenges, those IDs identify the
 * related transaction resource. We therefore resolve challenge -> correlation
 * id -> transaction -> txHash before falling back to a tightly scoped recent
 * contract-execution lookup.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`circle-txs:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    userToken?: unknown;
    walletId?: unknown;
    challengeId?: unknown;
    since?: unknown;
  };
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
    return NextResponse.json(
      { error: "Circle transaction lookup is unavailable." },
      { status: 500 },
    );
  }

  const userToken = String(body.userToken);
  const walletId = String(body.walletId);
  const challengeId = body.challengeId as string | undefined;
  const after = Number(body.since || 0);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "X-User-Token": userToken,
    Accept: "application/json",
  };

  try {
    if (challengeId) {
      // First ask Circle for the challenge itself. This is the authoritative
      // source for whether the PIN/security challenge actually completed.
      const challengeResponse = await fetch(
        `https://api.circle.com/v1/w3s/user/challenges/${encodeURIComponent(challengeId)}`,
        { headers, cache: "no-store" },
      );
      const challengeData = await challengeResponse.json().catch(() => null);

      if (challengeResponse.ok) {
        const challenge = challengeData?.data?.challenge;
        const status = String(challenge?.status || "");
        const correlationIds = Array.isArray(challenge?.correlationIds)
          ? challenge.correlationIds.filter((id: unknown): id is string => typeof id === "string")
          : [];

        if (status === "FAILED" || status === "EXPIRED") {
          return NextResponse.json(
            {
              error: "challenge_failed",
              message: challenge?.errorMessage || `Circle challenge ${status.toLowerCase()}.`,
              challengeId,
              walletId,
            },
            { status: 422 },
          );
        }

        // Circle's challenge correlation IDs are the bridge from the user
        // approval challenge to the actual transaction resource. Resolve them
        // directly instead of assuming the transaction itself contains a
        // challengeId field.
        for (const correlationId of correlationIds) {
          const txResponse = await fetch(
            `https://api.circle.com/v1/w3s/transactions/${encodeURIComponent(correlationId)}`,
            { headers, cache: "no-store" },
          );
          if (!txResponse.ok) continue;
          const txData = await txResponse.json().catch(() => null);
          const transaction = txData?.data?.transaction;
          if (!transaction) continue;
          if (transaction.walletId && String(transaction.walletId) !== walletId) continue;
          if (transaction.txHash) {
            return NextResponse.json({
              txHash: transaction.txHash,
              challengeId,
              walletId,
              transactionId: transaction.id,
              state: transaction.state,
            });
          }
          if (transaction.state === "FAILED" || transaction.state === "DENIED" || transaction.state === "CANCELLED") {
            return NextResponse.json(
              {
                error: "transaction_failed",
                message: transaction.errorReason || `Circle transaction ${transaction.state.toLowerCase()}.`,
                challengeId,
                walletId,
                transactionId: transaction.id,
              },
              { status: 422 },
            );
          }
        }

        // If the challenge is not complete yet, keep polling. Even after the
        // challenge completes, Circle may need a short period to index the tx.
        if (status !== "COMPLETE") {
          return NextResponse.json({ txHash: null, challengeId, walletId, challengeStatus: status });
        }
      }

      // Secondary authoritative lookup: Circle's transaction list supports
      // wallet, operation, and creation-time filters. Restrict this to contract
      // executions created after this exact challenge was prepared.
      const params = new URLSearchParams({
        walletIds: walletId,
        operation: "CONTRACT_EXECUTION",
        from: new Date(Math.max(0, after - 5_000)).toISOString(),
        order: "DESC",
        pageSize: "50",
      });
      const listResponse = await fetch(
        `https://api.circle.com/v1/w3s/transactions?${params.toString()}`,
        { headers, cache: "no-store" },
      );
      const listData = await listResponse.json().catch(() => null);
      if (listResponse.ok) {
        const transactions = Array.isArray(listData?.data?.transactions)
          ? listData.data.transactions
          : [];
        const candidates = transactions.filter(
          (item: { walletId?: string; txHash?: string; createDate?: string }) =>
            (!item.walletId || String(item.walletId) === walletId) &&
            item.txHash &&
            new Date(item.createDate || 0).getTime() >= after - 5_000,
        );
        if (candidates.length > 0) {
          const newest = candidates[0];
          return NextResponse.json({
            txHash: newest.txHash,
            challengeId,
            walletId,
            transactionId: newest.id,
            state: newest.state,
          });
        }
      }

      return NextResponse.json({
        txHash: null,
        challengeId,
        walletId,
        challengeStatus: challengeData?.data?.challenge?.status || "PENDING",
      });
    }

    // Fallback for legacy callers without a challenge ID. Still scope the
    // lookup to this wallet, contract executions, and a narrow creation window.
    const params = new URLSearchParams({
      walletIds: walletId,
      operation: "CONTRACT_EXECUTION",
      from: new Date(Math.max(0, after - 5_000)).toISOString(),
      order: "DESC",
      pageSize: "50",
    });
    const response = await fetch(
      `https://api.circle.com/v1/w3s/transactions?${params.toString()}`,
      { headers, cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || "Could not read Circle transactions." },
        { status: response.status },
      );
    }

    const list = Array.isArray(data?.data?.transactions) ? data.data.transactions : [];
    const candidates = list.filter(
      (item: { walletId?: string; txHash?: string; createDate?: string }) =>
        (!item.walletId || String(item.walletId) === walletId) &&
        item.txHash &&
        new Date(item.createDate || 0).getTime() >= after - 5_000,
    );
    if (candidates.length === 1) {
      return NextResponse.json({ txHash: candidates[0].txHash, walletId });
    }
    return NextResponse.json({ txHash: null, walletId });
  } catch (error) {
    console.error("[Circle PW] Transaction lookup failed:", error);
    return NextResponse.json({ txHash: null, challengeId, walletId });
  }
}
