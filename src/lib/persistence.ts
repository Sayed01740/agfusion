import type { TransactionRecord } from "@/types";

const TX_KEY = "AGFusion_txs_v1";
const MAX_TXS = 40;

/**
 * Storage key per wallet so history never leaks between wallets.
 * No address (disconnected) resolves to the legacy key so callers that
 * intentionally pass no wallet still have a deterministic target.
 */
function txKey(address?: string | null): string {
  if (!address) return TX_KEY;
  return `${TX_KEY}:${address.toLowerCase()}`;
}

/**
 * Load transactions for a specific wallet. Without a wallet address nothing
 * is returned — a disconnected session never shows another wallet's history
 * (the pre-wallet-scoping global key is intentionally ignored on read).
 */
export function loadTransactions(address?: string | null): TransactionRecord[] {
  if (typeof window === "undefined") return [];
  if (!address) return [];
  try {
    const raw = localStorage.getItem(txKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TransactionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist transactions under the given wallet's key. */
export function saveTransactions(
  txs: TransactionRecord[],
  address?: string | null,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      txKey(address),
      JSON.stringify(txs.slice(0, MAX_TXS)),
    );
  } catch {
    /* quota */
  }
}

/** Remove a wallet's persisted history (plus the legacy global key). */
export function clearTransactions(address?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(txKey(address));
    localStorage.removeItem(TX_KEY);
  } catch {
    /* ignore */
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
