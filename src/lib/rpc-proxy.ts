/**
 * Shared JSON-RPC proxy logic used by /api/rpc.
 *
 * Every bridge chain gets an independent upstream pool and an expected chain ID.
 * Read-only requests can fail over. Write requests are sent exactly once, but
 * only after selecting a currently healthy upstream, which avoids sending a
 * transaction to a dead public endpoint while preserving the no-duplicate rule.
 */

export const ARC_EXPECTED_CHAIN_ID_HEX = "0x4cef52";

/** Expected EVM chain IDs for every chain exposed by the bridge UI. */
export const EXPECTED_CHAIN_IDS: Record<string, string> = {
  arc: ARC_EXPECTED_CHAIN_ID_HEX,
  base: "0x14a34",
  eth: "0xaa36a7",
  arb: "0x66eee",
  op: "0xaa37dc",
  polygon: "0x13882",
  avax: "0xa869",
  unichain: "0x515",
  linea: "0xe705",
};

/** Ordered upstreams per chain key. First healthy provider wins. */
export const RPC_UPSTREAMS: Record<string, string[]> = {
  arc: [
    "https://rpc.testnet.arc.io",
    "https://rpc.testnet.arc.network",
    "https://rpc.blockdaemon.testnet.arc.io",
    "https://rpc.drpc.testnet.arc.io",
    "https://rpc.quicknode.testnet.arc.io",
  ],
  base: [
    // Base's public endpoint is rate-limited, so keep it as a last resort.
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.g.alchemy.com/v2/demo",
    "https://84532.rpc.thirdweb.com",
    "https://sepolia.base.org",
  ],
  eth: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
    "https://rpc2.sepolia.org",
    "https://11155111.rpc.thirdweb.com",
  ],
  arb: [
    "https://arbitrum-sepolia-rpc.publicnode.com",
    "https://sepolia-rollup.arbitrum.io/rpc",
    "https://421614.rpc.thirdweb.com",
  ],
  op: [
    "https://optimism-sepolia-rpc.publicnode.com",
    "https://sepolia.optimism.io",
    "https://11155420.rpc.thirdweb.com",
  ],
  polygon: [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology",
    "https://80002.rpc.thirdweb.com",
  ],
  avax: [
    "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    "https://api.avax-test.network/ext/bc/C/rpc",
    "https://43113.rpc.thirdweb.com",
  ],
  unichain: [
    "https://unichain-sepolia.g.alchemy.com/v2/demo",
    "https://sepolia.unichain.org",
    "https://1301.rpc.thirdweb.com",
  ],
  linea: [
    "https://linea-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.linea.build",
    "https://59141.rpc.thirdweb.com",
  ],
};

const WRITE_METHODS = new Set<string>([
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData_v4",
]);

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method);
}

export function chainKey(raw: string | null): string {
  return (raw || "arc").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ForwardResult {
  ok: boolean;
  status: number;
  text: string;
}

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

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

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
 * Find a live upstream by asking it for eth_chainId. This is safe even for
 * write operations because the write itself is still performed only once.
 */
export async function findHealthyUpstream(
  chain: string,
  timeoutMs = 5_000,
): Promise<{ upstream: string; chainId: string } | null> {
  const upstreams = RPC_UPSTREAMS[chain];
  if (!upstreams?.length) return null;
  const expected = EXPECTED_CHAIN_IDS[chain]?.toLowerCase();
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_chainId",
    params: [],
  });

  for (const upstream of upstreams) {
    const result = await forwardJsonRpc(upstream, body, timeoutMs);
    if (!result.ok) continue;
    const parsed = parseJsonRpc(result.text);
    if (!parsed.ok) continue;
    const chainId = String(parsed.result ?? "").toLowerCase();
    if (!expected || chainId === expected) {
      return { upstream, chainId };
    }
  }
  return null;
}

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
  const expected = EXPECTED_CHAIN_IDS[chain] ?? null;
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
      tried.push(`${up}→chain-mismatch(${chainId})`);
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
