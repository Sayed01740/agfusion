/**
 * Browser fetch patches for Circle App Kit:
 * 1) api.circle.com stablecoinKits → our /api/circle/proxy (auth + CORS)
 * 2) public chain RPCs (Arc, Base Sepolia, …) → our /api/rpc (avoids flaky browser RPC)
 *
 * Circle often wraps any fetch/RPC failure as:
 *   "Network connection failed for Arc Testnet" (code 3001)
 */

let installed = false;

/** Map host → /api/rpc?chain=… */
const RPC_HOST_TO_CHAIN: Record<string, string> = {
  // Arc Testnet
  "rpc.testnet.arc.io": "arc",
  "rpc.testnet.arc.network": "arc",
  // Base Sepolia
  "sepolia.base.org": "base",
  "base-sepolia-rpc.publicnode.com": "base",
  "base-sepolia.g.alchemy.com": "base",
  // Ethereum Sepolia
  "rpc.sepolia.org": "eth",
  "ethereum-sepolia-rpc.publicnode.com": "eth",
  "rpc2.sepolia.org": "eth",
  // Arbitrum Sepolia
  "sepolia-rollup.arbitrum.io": "arb",
  "arbitrum-sepolia-rpc.publicnode.com": "arb",
  // Optimism Sepolia
  "sepolia.optimism.io": "op",
  "optimism-sepolia-rpc.publicnode.com": "op",
  // Polygon Amoy
  "rpc-amoy.polygon.technology": "polygon",
  "polygon-amoy-bor-rpc.publicnode.com": "polygon",
  // Avalanche Fuji
  "api.avax-test.network": "avax",
  "avalanche-fuji-rpc.publicnode.com": "avax",
  // Unichain Sepolia
  "sepolia.unichain.org": "unichain",
  "unichain-sepolia-rpc.publicnode.com": "unichain",
  // Linea Sepolia
  "rpc.sepolia.linea.build": "linea",
  "linea-sepolia-rpc.publicnode.com": "linea",
};

function resolveRpcProxy(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    // Already our proxy — never re-proxy
    if (u.pathname.startsWith("/api/rpc")) return null;
    if (u.hostname === window.location.hostname && u.pathname.includes("/api/rpc")) {
      return null;
    }

    const host = u.hostname.toLowerCase();
    const chain = RPC_HOST_TO_CHAIN[host];
    if (chain) {
      return `${window.location.origin}/api/rpc?chain=${chain}`;
    }

    // Path-style Avalanche C-Chain
    if (
      host === "api.avax-test.network" ||
      (host.includes("avax") && u.pathname.includes("/ext/bc/C/rpc"))
    ) {
      return `${window.location.origin}/api/rpc?chain=avax`;
    }

    // Arc RPC env override host
    const arcEnv = (process.env.NEXT_PUBLIC_ARC_RPC_URL || "").trim();
    if (arcEnv) {
      try {
        const envHost = new URL(arcEnv).hostname.toLowerCase();
        if (host === envHost) {
          return `${window.location.origin}/api/rpc?chain=arc`;
        }
      } catch {
        /* ignore bad env */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function installCircleApiProxy(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (typeof raw === "string") {
        // 0) Circle IRIS attestation API → server proxy (CORS-safe)
        if (raw.includes("iris-api.circle.com")) {
          const u = new URL(raw);
          const path = u.pathname + u.search;
          const proxyUrl = `/api/circle/iris?path=${encodeURIComponent(path)}`;
          return originalFetch(proxyUrl, init);
        }

        // 1) Circle Stablecoin Kits API
        if (
          raw.includes("api.circle.com") &&
          raw.includes("/v1/stablecoinKits/")
        ) {
          const u = new URL(raw);
          const path = u.pathname + u.search;
          const proxyUrl = `/api/circle/proxy?path=${encodeURIComponent(path)}`;
          return originalFetch(proxyUrl, init);
        }

        // 2) Public EVM RPCs → same-origin JSON-RPC proxy
        const rpcProxy = resolveRpcProxy(raw);
        if (rpcProxy) {
          return originalFetch(rpcProxy, {
            ...init,
            method: init?.method || "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(init?.headers as Record<string, string> | undefined),
            },
          });
        }
      }
    } catch {
      /* fall through to original */
    }
    return originalFetch(input, init);
  };
}

/** Whether the fetch patch is active (for diagnostics). */
export function isCircleApiProxyInstalled(): boolean {
  return installed;
}
