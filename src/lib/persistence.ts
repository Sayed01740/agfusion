import type { TransactionRecord } from "@/types";

const TX_KEY = "AGFusion_txs_v1";
const MAX_TXS = 40;

export function loadTransactions(): TransactionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TransactionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTransactions(txs: TransactionRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TX_KEY, JSON.stringify(txs.slice(0, MAX_TXS)));
  } catch {
    /* quota */
  }
}

export function mergeTransactions(
  existing: TransactionRecord[],
  incoming: TransactionRecord[],
): TransactionRecord[] {
  const map = new Map<string, TransactionRecord>();
  for (const t of [...incoming, ...existing]) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
