/**
 * JSON-RPC proxy for browser App Kit / viem public clients.
 * Avoids "Network connection failed for Arc Testnet" when the browser cannot
 * reach public RPCs (CORS, flaky endpoints, corporate filters).
 *
 * Read-only calls fail over across multiple genuinely independent upstreams;
 * write calls (eth_sendRawTransaction, personal_sign, …) are single-attempt
 * so a lost response can never cause a duplicate on-chain submission.
 */

import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  ARC_EXPECTED_CHAIN_ID_HEX,
  RPC_UPSTREAMS,
  chainKey,
  forwardJsonRpc,
  healthCheck,
  isWriteMethod,
  parseJsonRpc,
} from "@/lib/rpc-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Arc Testnet currently has a node-level eth_estimateGas problem for USDC/CCTP
 * writes. Circle's own Arc issue tracker documents that these transactions can
 * fail gas estimation while succeeding with an explicit 600,000 gas limit.
 *
 * Keep this workaround narrowly scoped to the contracts used by CCTP/Bridge Kit
 * on Arc. We do not change estimation for unrelated Arc contracts or any other
 * chain.
 */
const ARC_BRIDGE_WRITE_TARGETS = new Set([
  "0x3600000000000000000000000000000000000000", // Arc USDC
  "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa", // CCTP TokenMessengerV2
  "0xe737e5cebeeba77efe34d4aa090756590b1ce275", // CCTP MessageTransmitterV2
  "0xc5567a5e3370d4dbfb0540025078e283e36a363d", // Circle Bridge Kit contract
]);
const ARC_BRIDGE_GAS_LIMIT_HEX = "0x927c0"; // 600,000

function shouldUseArcBridgeGasFallback(
  chain: string,
  method: string,
  body: string,
): boolean {
  if (chain !== "arc" || method !== "eth_estimateGas") return false;
  try {
    const parsed = JSON.parse(body) as {
      params?: unknown[];
    };
    const tx = parsed.params?.[0];
    if (!tx || typeof tx !== "object") return false;
    const to = (tx as { to?: unknown }).to;
    return typeof to === "string" && ARC_BRIDGE_WRITE_TARGETS.has(to.toLowerCase());
  } catch {
    return false;
  }
}

/** Health / debug: GET /api/rpc?chain=arc — reports chain, chainId, upstream, latency. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = chainKey(url.searchParams.get("chain"));
  const health = await healthCheck(chain);
  if (!health.ok) {
    return NextResponse.json(
      {
        ok: false,
        chain,
        error: health.error,
        tried: health.tried,
      },
      { status: health.error === "unknown_chain" ? 400 : 502 },
    );
  }
  return NextResponse.json(health);
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

  // Extract the JSON-RPC method for safety classification.
  let method = "";
  let requestId: unknown = null;
  try {
    const parsed = JSON.parse(body) as { method?: unknown; id?: unknown };
    method = String(parsed.method || "");
    requestId = parsed.id ?? null;
  } catch {
    /* body already validated above */
  }

  // Arc Testnet CCTP/USDC bridge writes must bypass the unreliable node-side
  // gas estimator. Returning a fixed estimate here lets App Kit build and show
  // the normal wallet signature request without changing the actual transaction
  // flow or taking custody of the wallet.
  if (shouldUseArcBridgeGasFallback(chain, method, body)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: requestId,
        result: ARC_BRIDGE_GAS_LIMIT_HEX,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-AGFusion-RPC-Workaround": "arc-cctp-fixed-gas-600000",
        },
      },
    );
  }

  const errors: string[] = [];

  // Write methods: try the first upstream only. A retry on a second upstream
  // could double-submit if the first one accepted but the response was lost.
  const attempts = isWriteMethod(method) ? upstreams.slice(0, 1) : upstreams;

  for (const up of attempts) {
    const r = await forwardJsonRpc(up, body);
    if (r.ok) {
      // For eth_chainId on Arc, verify the upstream really is Arc Testnet.
      if (method === "eth_chainId" && chain === "arc") {
        const parsed = parseJsonRpc(r.text);
        const actual = String(parsed.result ?? "").toLowerCase();
        if (!parsed.ok || actual !== ARC_EXPECTED_CHAIN_ID_HEX.toLowerCase()) {
          errors.push(`${up}→chain-mismatch`);
          // Not the right chain — try next upstream (chainId reads are safe to fail over).
          continue;
        }
      }
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
    // Never fail over a write method that already errored — surface its result.
    if (isWriteMethod(method)) {
      return new NextResponse(r.text, {
        status: r.status >= 400 ? r.status : 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
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
