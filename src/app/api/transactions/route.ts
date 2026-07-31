import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listTransactions, persistTransaction } from "@/lib/tx-store";
import { persistTxSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isDbConfigured } from "@/lib/db";
import { redactTransactionForClient } from "@/lib/public-api";
import type { TransactionRecord } from "@/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addressQuery = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .optional();

/**
 * List transactions for session user and/or ?address=0x…
 * Falls back to [] when DB unavailable (client still has localStorage).
 */
export async function GET(req: Request) {
  const rl = rateLimit(`txget:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const addrRaw = url.searchParams.get("address") || url.searchParams.get("wallet");
  const addrParsed = addressQuery.safeParse(addrRaw || undefined);
  const queryAddress = addrParsed.success ? addrParsed.data : undefined;

  const user = await getSessionUser();

  if (!isDbConfigured()) {
    return NextResponse.json({
      transactions: [],
      source: "client_storage",
      note: "DB not configured — activity is kept in this browser.",
    });
  }

  const transactions = await listTransactions({
    userId:
      user && user.id !== "ephemeral" && !user.id.startsWith("mem_")
        ? user.id
        : undefined,
    walletAddress: queryAddress || user?.address,
    limit: 50,
  });

  return NextResponse.json({
    transactions: transactions.map((t) =>
      redactTransactionForClient(t as unknown as Record<string, unknown>),
    ),
    source: "database",
  });
}

/**
 * Persist a tx. Auth preferred; also accepts walletAddress for browser-only sessions.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`txpost:${ip}`, { windowMs: 60_000, max: 60 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = persistTxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const user = await getSessionUser();
  const d = parsed.data;
  const walletFromBody =
    typeof (body as { walletAddress?: string }).walletAddress === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test((body as { walletAddress: string }).walletAddress)
      ? (body as { walletAddress: string }).walletAddress
      : undefined;

  const walletAddress = user?.address || walletFromBody;
  if (!walletAddress && !user) {
    // Client still has localStorage — don't hard-fail the UI
    return NextResponse.json({
      ok: true,
      saved: false,
      note: "Saved in browser only (connect + optional SIWE for server history)",
    });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, saved: false, source: "client_storage" });
  }

  const record: TransactionRecord = {
    id: d.clientId || `tx_${Date.now()}`,
    type: d.type,
    status: d.status as TransactionRecord["status"],
    amount: d.amount,
    token: d.token,
    tokenOut: d.tokenOut,
    fromChain: d.fromChain as TransactionRecord["fromChain"],
    toChain: d.toChain as TransactionRecord["toChain"],
    recipient: d.recipient,
    recipientLabel: d.recipientLabel,
    feeUsd: d.feeUsd,
    txHash: d.txHash,
    explorerUrl: d.explorerUrl,
    executionMode: d.executionMode || "live",
    message: d.message,
    steps: d.stepsJson ? JSON.parse(d.stepsJson) : [],
    createdAt: new Date().toISOString(),
  };

  const id = await persistTransaction(record, {
    userId:
      user && user.id !== "ephemeral" && !user.id.startsWith("mem_")
        ? user.id
        : undefined,
    walletAddress,
  });

  return NextResponse.json({ ok: true, saved: Boolean(id) });
}
