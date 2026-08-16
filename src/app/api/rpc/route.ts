/**
 * JSON-RPC proxy for browser App Kit / viem public clients.
 * Avoids "Network connection failed for Arc Testnet" when the browser cannot
 * reach public RPCs (CORS, flaky endpoints, corporate filters).
 *
 * Tries multiple upstreams per chain and returns proper JSON-RPC errors.
 */

import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ARC_PRIMARY =
  process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
  "https://rpc.testnet.arc.network";

/** Ordered fallbacks per chain key */
const RPC_UPSTREAMS: Record<string, string[]> = {
  arc: [
    ARC_PRIMARY,
    "https://rpc.testnet.arc.network",
    "https://rpc.testnet.arc.network/",
  ].filter((u, i, a) => a.indexOf(u) === i),
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

function chainKey(raw: string | null): string {
  return (raw || "arc").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function forwardJsonRpc(
  upstream: string,
  body: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  // 15s per upstream: long enough for slow testnet RPCs (Arc, Base, Fuji) but
  // leaves headroom under the Vercel 60s maxDuration for the multi-upstream loop.
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await upstreamRes.text();
    // Treat empty / HTML / non-json as failure so we try next upstream
    const looksJson =
      text.trim().startsWith("{") || text.trim().startsWith("[");
    if (!upstreamRes.ok || !looksJson) {
      return { ok: false, status: upstreamRes.status, text };
    }
    return { ok: true, status: upstreamRes.status, text };
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

/** Health / debug: GET /api/rpc?chain=arc */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = chainKey(url.searchParams.get("chain"));
  const upstreams = RPC_UPSTREAMS[chain];
  if (!upstreams?.length) {
    return NextResponse.json(
      { ok: false, error: "unknown_chain", chain },
      { status: 400 },
    );
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_chainId",
    params: [],
  });

  for (const up of upstreams) {
    const r = await forwardJsonRpc(up, body);
    if (r.ok) {
      try {
        const j = JSON.parse(r.text) as { result?: string };
        return NextResponse.json({
          ok: true,
          chain,
          upstream: up,
          chainId: j.result ?? null,
        });
      } catch {
        /* try next */
      }
    }
  }

  return NextResponse.json(
    { ok: false, chain, error: "all_upstreams_failed", tried: upstreams },
    { status: 502 },
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`rpc:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32005,
          message: "RPC proxy rate limited — wait a moment and retry",
        },
      },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const chain = chainKey(url.searchParams.get("chain"));
  const upstreams = RPC_UPSTREAMS[chain];
  if (!upstreams?.length) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32602,
          message: `Unsupported chain: ${chain}`,
        },
      },
      { status: 400 },
    );
  }

  let body: string;
  try {
    body = await req.text();
    JSON.parse(body);
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON body" },
      },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  for (const up of upstreams) {
    const r = await forwardJsonRpc(up, body);
    if (r.ok) {
      return new NextResponse(r.text, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-AGFusion-RPC-Upstream": up,
          "X-AGFusion-RPC-Chain": chain,
        },
      });
    }
    errors.push(`${up}→${r.status}`);
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: `RPC proxy failed for ${chain} (tried: ${errors.join("; ")})`,
      },
    },
    { status: 502 },
  );
}
