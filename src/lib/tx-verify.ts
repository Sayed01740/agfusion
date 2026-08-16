/**
 * On-chain transaction verification (Phase 5).
 *
 * The blockchain is the source of truth: a transaction is only reported as
 * successful after its receipt is found with status 0x1 on the correct chain.
 * Circle challenge success, SDK "no error", or a wallet signature are never
 * sufficient on their own.
 */

export type ReceiptStatus = "success" | "reverted" | "pending" | "not_found";

/** Valid 0x + 64 hex chars transaction hash. */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll eth_getTransactionReceipt for a hash through the /api/rpc proxy.
 * - receipt found + status 0x1      → "success"
 * - receipt found + other status    → "reverted"
 * - receipt missing after attempts  → "not_found" (may be pending or unknown)
 * - network/HTTP failure            → throws (caller decides how to degrade)
 */
export async function verifyReceiptOnChain(opts: {
  chainKey: string;
  txHash: string;
  attempts?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ status: ReceiptStatus; receipt: unknown }> {
  if (!isValidTxHash(opts.txHash)) {
    throw new Error("Invalid transaction hash — cannot verify on-chain.");
  }
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1_500;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  let lastReceipt: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetchImpl(`/api/rpc?chain=${encodeURIComponent(opts.chainKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [opts.txHash],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`RPC ${opts.chainKey} failed during verification (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as {
      result?: { status?: string; blockNumber?: string } | null;
      error?: { message?: string };
    };
    if (data.error) {
      throw new Error(data.error.message || "RPC error during verification.");
    }
    const receipt = data.result;
    lastReceipt = receipt;
    if (receipt) {
      if (receipt.status === "0x1") return { status: "success", receipt };
      return { status: "reverted", receipt };
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return { status: "not_found", receipt: lastReceipt };
}
