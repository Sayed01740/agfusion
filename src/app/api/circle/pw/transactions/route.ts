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
 * Circle processes user-controlled-wallet transactions asynchronously. A
 * completed PIN challenge does not guarantee that txHash is populated yet.
 * The challenge correlation id can identify the exact transaction resource,
 * so once that id is known we poll that transaction directly instead of
 * repeatedly guessing from a recent transaction window.
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
    transactionId?: unknown;
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
    body.transactionId !== undefined &&
    (typeof body.transactionId !== "string" || body.transactionId.length > 200)
  ) {
    return NextResponse.json({ error: "invalid_transaction_id" }, { status: 400 });
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
  const transactionId = body.transactionId as string | undefined;
  const after = Number(body.since || 0);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "X-User-Token": userToken,
    Accept: "application/json",
  };

  try {
    // Once Circle exposes the exact transaction resource, use that resource
    // directly. This removes ambiguity and lets the browser keep polling until
    // Circle assigns the blockchain hash.
    if (transactionId) {
      const txResponse = await fetch(
        `https://api.circle.com/v1/w3s/transactions/${encodeURIComponent(transactionId)}`,
        { headers, cache: "no-store" },
      );
      const txData = await txResponse.json().catch(() => null);
      if (txResponse.ok) {
        const transaction = txData?.data?.transaction;
        if (transaction && (!transaction.walletId || String(transaction.walletId) === walletId)) {
          if (transaction.txHash) {
            return NextResponse.json({
              txHash: transaction.txHash,
              transactionId: transaction.id || transactionId,
              challengeId,
              walletId,
              state: transaction.state,
            });
          }
          if (["FAILED", "DENIED", "CANCELLED"].includes(String(transaction.state))) {
            return NextResponse.json(
              {
                error: "transaction_failed",
                message: transaction.errorReason || `Circle transaction ${String(transaction.state).toLowerCase()}.`,
                challengeId,
                walletId,
                transactionId: transaction.id || transactionId,
                state: transaction.state,
              },
              { status: 422 },
            );
          }
          return NextResponse.json({
            txHash: null,
            challengeId,
            walletId,
            transactionId: transaction.id || transactionId,
            state: transaction.state || "INITIATED",
          });
        }
      }
    }

    if (challengeId) {
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

        // Correlation IDs are the strongest linkage Circle gives us between a
        // user challenge and the resulting resource. If the resource exists,
        // return its id even when txHash is not available yet.
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
              transactionId: transaction.id || correlationId,
              state: transaction.state,
            });
          }
          if (["FAILED", "DENIED", "CANCELLED"].includes(String(transaction.state))) {
            return NextResponse.json(
              {
                error: "transaction_failed",
                message: transaction.errorReason || `Circle transaction ${String(transaction.state).toLowerCase()}.`,
                challengeId,
                walletId,
                transactionId: transaction.id || correlationId,
                state: transaction.state,
              },
              { status: 422 },
            );
          }
          return NextResponse.json({
            txHash: null,
            challengeId,
            walletId,
            transactionId: transaction.id || correlationId,
            state: transaction.state || "INITIATED",
            challengeStatus: status,
          });
        }

        // Circle's challenge state is COMPLETED after the user approval has
        // completed. The underlying transaction can still be INITIATED/QUEUED,
        // so continue to the transaction list below rather than failing early.
        if (status === "PENDING" || status === "IN_PROGRESS" || status === "COMPLETED") {
          // continue
        }
      }

      // Secondary lookup, still scoped to this wallet and exact operation.
      // Circle documents from/walletIds/operation as supported transaction
      // filters, so this is authoritative rather than a local guess.
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
          (item: { walletId?: string; txHash?: string; createDate?: string; id?: string }) =>
            (!item.walletId || String(item.walletId) === walletId) &&
            new Date(item.createDate || 0).getTime() >= after - 5_000,
        );
        if (candidates.length > 0) {
          const newest = candidates[0];
          return NextResponse.json({
            txHash: newest.txHash || null,
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
        new Date(item.createDate || 0).getTime() >= after - 5_000,
    );
    if (candidates.length === 1) {
      return NextResponse.json({
        txHash: candidates[0].txHash || null,
        walletId,
        transactionId: candidates[0].id,
        state: candidates[0].state,
      });
    }
    return NextResponse.json({ txHash: null, walletId });
  } catch (error) {
    console.error("[Circle PW] Transaction lookup failed:", error);
    return NextResponse.json({ txHash: null, challengeId, walletId });
  }
}
