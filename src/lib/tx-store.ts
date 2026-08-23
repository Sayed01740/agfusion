import type { TransactionRecord } from "@/types";
import { getPrisma, isDbConfigured } from "@/lib/db";

export async function persistTransaction(
  tx: TransactionRecord,
  opts?: { userId?: string; walletAddress?: string },
): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    const prisma = getPrisma();
    const row = await prisma.transaction.create({
      data: {
        clientId: tx.id,
        userId: opts?.userId,
        walletAddress: (opts?.walletAddress || "").toLowerCase() || null,
        type: tx.type,
        status: tx.status,
        amount: tx.amount,
        token: tx.token,
        tokenOut: tx.tokenOut,
        fromChain: tx.fromChain,
        toChain: tx.toChain,
        recipient: tx.recipient,
        recipientLabel: tx.recipientLabel,
        feeUsd: tx.feeUsd,
        txHash: tx.txHash,
        explorerUrl: tx.explorerUrl,
        executionMode: tx.executionMode || "live",
        message: tx.message,
        stepsJson: JSON.stringify(tx.steps || []),
      },
    });
    return row.id;
  } catch (e) {
    console.warn("[tx-store] persist failed", e);
    return null;
  }
}

export async function listTransactions(opts: { walletAddress?: string; userId?: string; limit?: number }): Promise<TransactionRecord[]> {
  if (!isDbConfigured()) return [];
  try {
    const prisma = getPrisma();
    const or: object[] = [];
    if (opts.userId) or.push({ userId: opts.userId });
    if (opts.walletAddress) or.push({ walletAddress: opts.walletAddress.toLowerCase() });
    if (!or.length) return [];
    const rows = await prisma.transaction.findMany({ where: { OR: or }, orderBy: { createdAt: "desc" }, take: opts.limit || 50 });
    return rows.map((r) => ({ id: r.clientId || r.id, type: r.type as TransactionRecord["type"], status: r.status as TransactionRecord["status"], amount: r.amount, token: r.token, tokenOut: r.tokenOut || undefined, fromChain: r.fromChain as TransactionRecord["fromChain"], toChain: r.toChain as TransactionRecord["toChain"], recipient: r.recipient || undefined, recipientLabel: r.recipientLabel || undefined, feeUsd: r.feeUsd ?? undefined, txHash: r.txHash || undefined, explorerUrl: r.explorerUrl || undefined, executionMode: (r.executionMode as "demo" | "live") || "live", message: r.message || undefined, steps: r.stepsJson ? JSON.parse(r.stepsJson) : [], createdAt: r.createdAt.toISOString() }));
  } catch (e) {
    console.warn("[tx-store] list failed", e);
    return [];
  }
}

export async function logAgentRun(opts: { message: string; execute: boolean; confirmed: boolean; ip?: string; walletAddress?: string; userId?: string; toolTrace?: unknown; resultSummary?: string }) {
  if (!isDbConfigured()) return;
  try {
    await getPrisma().agentRun.create({ data: { message: opts.message.slice(0, 4000), execute: opts.execute, confirmed: opts.confirmed, ip: opts.ip, walletAddress: opts.walletAddress?.toLowerCase(), userId: opts.userId, toolTraceJson: opts.toolTrace ? JSON.stringify(opts.toolTrace).slice(0, 50_000) : null, resultSummary: opts.resultSummary?.slice(0, 2000) } });
  } catch (e) { console.warn("[tx-store] agent run persist failed", e); }
}

export async function logBridgeDiagnosticEvent(event: unknown, sessionId: string, walletAddress?: string) {
  if (!isDbConfigured()) return false;
  try {
    await getPrisma().agentRun.create({
      data: {
        message: `[BRIDGE_DIAGNOSTIC] ${sessionId}`,
        execute: true,
        confirmed: false,
        walletAddress: walletAddress?.toLowerCase(),
        toolTraceJson: JSON.stringify(event).slice(0, 50_000),
        resultSummary: "AGFusion bridge diagnostic event",
      },
    });
    return true;
  } catch (e) {
    console.warn("[bridge-diagnostics] database persist failed", e);
    return false;
  }
}

export async function listBridgeDiagnosticEvents(opts: { sessionId?: string; walletAddress?: string; limit?: number } = {}) {
  if (!isDbConfigured()) return [];
  try {
    const prisma = getPrisma();
    const rows = await prisma.agentRun.findMany({
      where: {
        message: opts.sessionId ? `[BRIDGE_DIAGNOSTIC] ${opts.sessionId}` : { startsWith: "[BRIDGE_DIAGNOSTIC]" },
        ...(opts.walletAddress ? { walletAddress: opts.walletAddress.toLowerCase() } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(opts.limit || 2000, 2000),
    });
    return rows.map((r) => ({ id: r.id, sessionId: r.message.replace("[BRIDGE_DIAGNOSTIC] ", ""), createdAt: r.createdAt.toISOString(), walletAddress: r.walletAddress, event: r.toolTraceJson ? JSON.parse(r.toolTraceJson) : null }));
  } catch (e) {
    console.warn("[bridge-diagnostics] database list failed", e);
    return [];
  }
}
