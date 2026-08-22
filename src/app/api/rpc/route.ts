/**
 * JSON-RPC proxy for browser App Kit / viem public clients.
 *
 * Read-only calls fail over across independent upstreams. Write calls are
 * never retried after submission, but they are first routed to an upstream
 * that has just passed an eth_chainId health check. This avoids sending a
 * wallet transaction to a dead public RPC such as an unhealthy Base endpoint.
 */

import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  RPC_UPSTREAMS,
  chainKey,
  findHealthyUpstream,
  forwardJsonRpc,
  healthCheck,
  isWriteMethod,
  parseJsonRpc,
} from "@/lib/rpc-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ARC_BRIDGE_WRITE_TARGETS = new Set([
  "0x3600000000000000000000000000000000000000",
  "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
  "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
  "0xc5567a5e3370d4dbfb0540025078e283e36a363d",
]);
const ARC_BRIDGE_GAS_LIMIT_HEX = "0x927c0"; // 600,000

function shouldUseArcBridgeGasFallback(
  chain: string,
  method: string,
  body: string,
): boolean {
  if (chain !== "arc" || method !== "eth_estimateGas") return false;
  try {
    const parsed = JSON.parse(body) as { params?: unknown[] };
    const tx = parsed.params?.[0];
    if (!tx || typeof tx !== "object") return false;
    const to = (tx as { to?: unknown }).to;
    return typeof to === "string" && ARC_BRIDGE_WRITE_TARGETS.has(to.toLowerCase());
  } catch {
    return false;
  }
}

/** GET /api/rpc?chain=<key> returns the first healthy upstream and chain ID. */
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
  return NextResponse.json(health, {
    headers: { "Cache-Control": "no-store" },
  });
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
        error: { code: -32602, message: `Unsupported chain: ${chain}` },
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

  let method = "";
  let requestId: unknown = null;
  try {
    const parsed = JSON.parse(body) as { method?: unknown; id?: unknown };
    method = String(parsed.method || "");
    requestId = parsed.id ?? null;
  } catch {
    /* body already validated */
  }

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

  // Writes are deliberately single-attempt. We first find a healthy endpoint,
  // then submit once to that endpoint. A lost response is never retried.
  if (isWriteMethod(method)) {
    const healthy = await findHealthyUpstream(chain, 5_000);
    if (!healthy) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: -32000,
            message: `No healthy RPC upstream is available for ${chain}; transaction was not submitted.`,
          },
        },
        { status: 503 },
      );
    }

    const r = await forwardJsonRpc(healthy.upstream, body);
    if (r.ok) {
      return new NextResponse(r.text, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-AGFusion-RPC-Upstream": healthy.upstream,
          "X-AGFusion-RPC-Chain": chain,
        },
      });
    }

    return new NextResponse(r.text, {
      status: r.status >= 400 ? r.status : 502,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-AGFusion-RPC-Upstream": healthy.upstream,
        "X-AGFusion-RPC-Chain": chain,
      },
    });
  }

  // Reads can safely fail over across the entire pool.
  for (const up of upstreams) {
    const r = await forwardJsonRpc(up, body);
    if (r.ok) {
      // Defensive validation for every chain, not just Arc.
      if (method === "eth_chainId") {
        const parsed = parseJsonRpc(r.text);
        const actual = String(parsed.result ?? "").toLowerCase();
        const health = await healthCheck(chain);
        if (!parsed.ok || (health.expectedChainId && actual !== health.expectedChainId.toLowerCase())) {
          errors.push(`${up}→chain-mismatch(${actual})`);
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
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32000,
        message: `RPC proxy failed for ${chain} (tried: ${errors.join("; ")})`,
      },
    },
    { status: 502 },
  );
}
