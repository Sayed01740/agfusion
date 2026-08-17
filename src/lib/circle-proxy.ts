/**
 * Browser fetch patches for Circle App Kit:
 * 1) Circle APIs → same-origin server proxies (auth + CORS safety)
 * 2) Public chain RPCs → /api/rpc (avoids flaky browser RPC)
 *
 * IMPORTANT: AGFusion is a testnet project and must not require a paid RPC plan.
 * If Circle/App Kit supplies a dRPC URL internally, the request is rewritten to
 * our same-origin /api/rpc proxy before it can reach dRPC directly.
 */

let installed = false;

/** Map known RPC hosts → /api/rpc?chain=… */
const RPC_HOST_TO_CHAIN: Record<string, string> = {
  "rpc.testnet.arc.io": "arc",
  "rpc.testnet.arc.network": "arc",
  "rpc.blockdaemon.testnet.arc.io": "arc",
  "rpc.blockdaemon.testnet.arc.network": "arc",
  "rpc.drpc.testnet.arc.io": "arc",
  "rpc.drpc.testnet.arc.network": "arc",
  "rpc.quicknode.testnet.arc.io": "arc",
  "rpc.quicknode.testnet.arc.network": "arc",
  "sepolia.base.org": "base",
  "base-sepolia-rpc.publicnode.com": "base",
  "base-sepolia.g.alchemy.com": "base",
  "base-sepolia.drpc.org": "base",
  "rpc.sepolia.org": "eth",
  "ethereum-sepolia-rpc.publicnode.com": "eth",
  "rpc2.sepolia.org": "eth",
  "sepolia.drpc.org": "eth",
  "sepolia-rollup.arbitrum.io": "arb",
  "arbitrum-sepolia-rpc.publicnode.com": "arb",
  "arbitrum-sepolia.drpc.org": "arb",
  "sepolia.optimism.io": "op",
  "optimism-sepolia-rpc.publicnode.com": "op",
  "optimism-sepolia.drpc.org": "op",
  "rpc-amoy.polygon.technology": "polygon",
  "polygon-amoy-bor-rpc.publicnode.com": "polygon",
  "polygon-amoy.drpc.org": "polygon",
  "api.avax-test.network": "avax",
  "avalanche-fuji-c-chain-rpc.publicnode.com": "avax",
  "avalanche-fuji-rpc.publicnode.com": "avax",
  "avalanche-fuji.drpc.org": "avax",
  "sepolia.unichain.org": "unichain",
  "unichain-sepolia-rpc.publicnode.com": "unichain",
  "unichain-sepolia.drpc.org": "unichain",
  "rpc.sepolia.linea.build": "linea",
  "linea-sepolia-rpc.publicnode.com": "linea",
  "linea-sepolia.drpc.org": "linea",
};

/**
 * Catch future dRPC hostname variants too, so a package update cannot silently
 * put a paid-only endpoint back into the browser path.
 */
function resolveRpcProxy(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.pathname.startsWith("/api/rpc")) return null;

    const host = u.hostname.toLowerCase();
    const chain = RPC_HOST_TO_CHAIN[host];
    if (chain) return `${window.location.origin}/api/rpc?chain=${chain}`;

    if (host.endsWith(".drpc.org")) {
      if (/^sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=eth`;
      if (/^base-sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=base`;
      if (/^arbitrum-sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=arb`;
      if (/^optimism-sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=op`;
      if (/^polygon-amoy\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=polygon`;
      if (/^avalanche-fuji\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=avax`;
      if (/^unichain-sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=unichain`;
      if (/^linea-sepolia\.drpc\.org$/.test(host)) return `${window.location.origin}/api/rpc?chain=linea`;
    }

    if (
      host === "api.avax-test.network" ||
      (host.includes("avax") && u.pathname.includes("/ext/bc/C/rpc"))
    ) {
      return `${window.location.origin}/api/rpc?chain=avax`;
    }

    const arcEnv = (process.env.NEXT_PUBLIC_ARC_RPC_URL || "").trim();
    if (arcEnv) {
      try {
        if (host === new URL(arcEnv).hostname.toLowerCase()) {
          return `${window.location.origin}/api/rpc?chain=arc`;
        }
      } catch {
        /* ignore malformed env */
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

  const proxiedFetch = async (
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
        if (
          raw.includes("iris-api-sandbox.circle.com") ||
          raw.includes("iris-api.circle.com")
        ) {
          const u = new URL(raw);
          const path = u.pathname + u.search;
          return originalFetch(
            `/api/circle/iris?path=${encodeURIComponent(path)}`,
            init,
          );
        }

        if (
          raw.includes("api.circle.com") &&
          raw.includes("/v1/stablecoinKits/")
        ) {
          const u = new URL(raw);
          const path = u.pathname + u.search;
          return originalFetch(
            `/api/circle/proxy?path=${encodeURIComponent(path)}`,
            init,
          );
        }

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

  // Keep both references patched. Some SDK/transport versions capture
  // globalThis.fetch rather than window.fetch during initialization.
  window.fetch = proxiedFetch;
  globalThis.fetch = proxiedFetch as typeof globalThis.fetch;
}

export function isCircleApiProxyInstalled(): boolean {
  return installed;
}
