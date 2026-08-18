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

/** Absolute same-origin API URL for browser and server verification. */
function apiUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Verify a transaction receipt through the AGFusion RPC proxy.
 *
 * Fail-closed invariant: malformed hashes and verification infrastructure
 * failures return `not_found`, never `success`. A caller may therefore expose
 * a transaction as pending/retryable, but can never turn an RPC failure into a
 * false successful financial operation.
 */
export async function verifyReceiptOnChain(opts: {
  chainKey: string;
  txHash: string;
  attempts?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ status: ReceiptStatus; receipt: unknown }> {
  if (!isValidTxHash(opts.txHash)) {
    return { status: "not_found", receipt: null };
  }

  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1_500;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return { status: "not_found", receipt: null };

  let lastReceipt: unknown = null;
  try {
    for (let i = 0; i < attempts; i += 1) {
      const res = await fetchImpl(
        apiUrl(`/api/rpc?chain=${encodeURIComponent(opts.chainKey)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [opts.txHash],
          }),
          cache: "no-store",
        },
      );
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
  } catch (error) {
    console.warn("[AGFusion] receipt verification unavailable; refusing success", error);
    return { status: "not_found", receipt: lastReceipt };
  }
}
