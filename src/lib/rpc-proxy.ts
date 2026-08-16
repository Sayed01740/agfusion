/**
 * Shared JSON-RPC proxy logic used by /api/rpc.
 *
 * Arc Testnet upstreams were verified on 2026-08-16: every entry answered
 * `eth_chainId` → 0x4cef52. They are genuinely independent providers
 * (Circle primary, Blockdaemon, dRPC, QuickNode) — not the same endpoint
 * repeated with different path spellings.
 *
 * Safety rules:
 * - Read-only requests may fail over across upstreams.
 * - Write requests (eth_sendRawTransaction, personal_sign, …) are NEVER
 *   retried on another upstream — a lost response after acceptance would
 *   otherwise cause a duplicate on-chain submission.
 */

export const ARC_EXPECTED_CHAIN_ID_HEX = "0x4cef52";

/** Ordered upstreams per chain key — first healthy provider wins. */
export const RPC_UPSTREAMS: Record<string, string[]> = {
  // Genuinely independent Arc Testnet RPC providers (all return 0x4cef52):
  // Circle primary, Blockdaemon, dRPC, QuickNode. See docs.arc.io/references/rpc-endpoints.
  arc: [
    "https://rpc.testnet.arc.network",
    "https://rpc.blockdaemon.testnet.arc.io",
    "https://rpc.drpc.testnet.arc.io",
    "https://rpc.quicknode.testnet.arc.io",
  ],
  base: [
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.g.alchemy.com/v2/demo",
    "https://84532.rpc.thirdweb.com",
  ],
  eth: [
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc2.sepolia.org",
    "https://11155111.rpc.thirdweb.com",
  ],
  arb: [
    "https://sepolia-rollup.arbitrum.io/rpc",
    "https://arbitrum-sepolia-rpc.publicnode.com",
    "https://421614.rpc.thirdweb.com",
  ],
  op: [
    "https://sepolia.optimism.io",
    "https://optimism-sepolia-rpc.publicnode.com",
    "https://11155420.rpc.thirdweb.com",
  ],
  polygon: [
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://80002.rpc.thirdweb.com",
  ],
  avax: [
    "https://api.avax-test.network/ext/bc/C/rpc",
    "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    "https://43113.rpc.thirdweb.com",
  ],
  unichain: [
    "https://sepolia.unichain.org",
    "https://unichain-sepolia-g.alchemy.com/v2/demo",
    "https://1301.rpc.thirdweb.com",
  ],
  linea: [
    "https://rpc.sepolia.linea.build",
    "https://linea-sepolia-rpc.publicnode.com",
    "https://59141.rpc.thirdweb.com",
  ],
};

// NOTE: `sonic` is intentionally absent from RPC_UPSTREAMS. The installed
// Circle SDK defines Sonic_Testnet with chainId 14601 while the live Sonic
// Blaze testnet uses 57054, so Sonic bridging is disabled until the SDK
// configuration and the actual network are verified compatible.

/**
 * Methods that mutate chain state. A blind retry on a second upstream could
 * double-execute if the first upstream actually accepted the request but the
 * response was lost — these are single-attempt only.
 */
const WRITE_METHODS = new Set<string>([
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
]);

/** True when retrying the call on another upstream is unsafe. */
export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method);
}

/** Normalize ?chain=… into a proxy key. */
export function chainKey(raw: string | null): string {
  return (raw || "arc").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ForwardResult {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * POST a JSON-RPC body to a single upstream with a timeout and a hard
 * non-HTML / valid-JSON gate (an HTTP 200 HTML page is never a valid
 * JSON-RPC response).
 */
export async function forwardJsonRpc(
  upstream: string,
  body: string,
  timeoutMs = 15_000,
): Promise<ForwardResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok || !looksLikeJson(text)) {
      return { ok: false, status: res.status, text };
    }
    return { ok: true, status: res.status, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 502,
      text: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: `Upstream error: ${msg}` },
      }),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** An HTTP 200 HTML page is not JSON-RPC. */
function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

/** Parse a JSON-RPC response body. */
export function parseJsonRpc(text: string): {
  ok: boolean;
  result?: unknown;
  error?: { code?: number; message?: string } | null;
} {
  try {
    const data = JSON.parse(text) as {
      result?: unknown;
      error?: { code?: number; message?: string } | null;
    };
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, error: { code: -32700, message: "Invalid JSON" } };
  }
}

/**
 * Health check for one chain: walk upstreams, require eth_chainId to match the
 * chain's expected id, and report the winner plus latency in ms.
 */
export async function healthCheck(chain: string): Promise<{
  ok: boolean;
  chain: string;
  upstream?: string;
  chainId?: string | null;
  latencyMs?: number;
  expectedChainId?: string | null;
  error?: string;
  tried?: string[];
}> {
  const upstreams = RPC_UPSTREAMS[chain];
  if (!upstreams?.length) {
    return { ok: false, chain, error: "unknown_chain" };
  }
  const expected =
    chain === "arc" ? ARC_EXPECTED_CHAIN_ID_HEX : null;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_chainId",
    params: [],
  });
  const tried: string[] = [];
  for (const up of upstreams) {
    const start = Date.now();
    const r = await forwardJsonRpc(up, body, 10_000);
    if (!r.ok) {
      tried.push(`${up}→${r.status}`);
      continue;
    }
    const parsed = parseJsonRpc(r.text);
    if (!parsed.ok) {
      tried.push(`${up}→bad-json`);
      continue;
    }
    const chainId = String(parsed.result ?? "");
    if (expected && chainId.toLowerCase() !== expected.toLowerCase()) {
      tried.push(`${up}→chain-mismatch`);
      continue;
    }
    return {
      ok: true,
      chain,
      upstream: up,
      chainId,
      expectedChainId: expected,
      latencyMs: Date.now() - start,
    };
  }
  return { ok: false, chain, error: "all_upstreams_failed", tried };
}
