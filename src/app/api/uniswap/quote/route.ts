import { NextResponse } from "next/server";
import { formatUnits, isAddress, parseUnits } from "viem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARC_MAINNET_CHAIN_ID = 5042;
const UNISWAP_API_URL = "https://trade-api.gateway.uniswap.org/v1/quote";
const UNIVERSAL_ROUTER_VERSION = "2.1.2";

const TOKENS = {
  USDC: { address: "0x3600000000000000000000000000000000000000", decimals: 6 },
  EURC: { address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6 },
  cirBTC: { address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
} as const;
type TokenSymbol = keyof typeof TOKENS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validAmount(value: string, decimals: number): boolean {
  if (value.length > 80 || !/^\d+(?:\.\d+)?$/.test(value)) return false;
  const fraction = value.split(".")[1] || "";
  if (fraction.length > decimals) return false;
  try {
    return parseUnits(value, decimals) > 0n;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(`uniswap-arc-quote:${clientIp(req)}`, { windowMs: 60_000, max: 20 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const bodyResult = await readLimitedJson(req, 8 * 1024);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!isRecord(bodyResult.value)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = bodyResult.value;
  const wallet = String(body.address || "").trim();
  const amount = String(body.amount || "").trim();
  const tokenIn = String(body.tokenIn || "") as TokenSymbol;
  const tokenOut = String(body.tokenOut || "") as TokenSymbol;
  const chainId = Number(body.chainId);
  const slippageBps = Number(body.slippageBps ?? 100);

  if (!isAddress(wallet)) {
    return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
  }
  if (chainId !== ARC_MAINNET_CHAIN_ID) {
    return NextResponse.json({ error: "unsupported_swap_chain" }, { status: 400 });
  }
  if (!(tokenIn in TOKENS) || !(tokenOut in TOKENS) || tokenIn === tokenOut) {
    return NextResponse.json({ error: "unsupported_swap_pair" }, { status: 400 });
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 500) {
    return NextResponse.json({ error: "invalid_slippage" }, { status: 400 });
  }

  const tokenInMeta = TOKENS[tokenIn];
  const tokenOutMeta = TOKENS[tokenOut];
  if (!validAmount(amount, tokenInMeta.decimals)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const apiKey = process.env.UNISWAP_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "uniswap_api_not_configured", detail: "Set UNISWAP_API_KEY as a server-only environment variable before requesting Arc Mainnet quotes." },
      { status: 503 },
    );
  }

  const amountBaseUnits = parseUnits(amount, tokenInMeta.decimals).toString();
  try {
    const upstream = await fetch(UNISWAP_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
        "x-permit2-disabled": "true",
      },
      body: JSON.stringify({
        type: "EXACT_INPUT",
        amount: amountBaseUnits,
        tokenInChainId: ARC_MAINNET_CHAIN_ID,
        tokenOutChainId: ARC_MAINNET_CHAIN_ID,
        tokenIn: tokenInMeta.address,
        tokenOut: tokenOutMeta.address,
        swapper: wallet,
        slippageTolerance: slippageBps / 100,
        routingPreference: "BEST_PRICE",
        protocols: ["V2", "V3", "V4"],
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    const payload: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.warn("[AGFusion] Uniswap quote request failed", { status: upstream.status });
      return NextResponse.json(
        { error: "uniswap_quote_unavailable", detail: "Uniswap could not provide a quote for this pair and amount." },
        { status: upstream.status === 429 ? 429 : 502 },
      );
    }
    if (!isRecord(payload) || !isRecord(payload.quote) || !isRecord(payload.quote.output)) {
      return NextResponse.json({ error: "invalid_uniswap_quote" }, { status: 502 });
    }

    const routing = String(payload.routing || "");
    const output = payload.quote.output;
    const outputToken = String(output.token || "").toLowerCase();
    const outputAmount = String(output.amount || "");
    const minimumAmount = String(output.minimumAmount || "");
    if (routing !== "CLASSIC") {
      return NextResponse.json(
        { error: "unsupported_uniswap_route", detail: "This preview currently supports CLASSIC wallet-signed routes only." },
        { status: 422 },
      );
    }
    if (outputToken !== tokenOutMeta.address.toLowerCase() || !/^\d+$/.test(outputAmount)) {
      return NextResponse.json({ error: "unverified_uniswap_quote" }, { status: 502 });
    }
    if (minimumAmount && !/^\d+$/.test(minimumAmount)) {
      return NextResponse.json({ error: "invalid_uniswap_minimum" }, { status: 502 });
    }

    // Intentionally return quote data only. Never expose upstream calldata,
    // Permit2 messages, approval transactions, or signing payloads from this endpoint.
    return NextResponse.json(
      {
        ok: true,
        chainId: ARC_MAINNET_CHAIN_ID,
        network: "mainnet",
        address: wallet,
        tokenIn,
        tokenOut,
        amountIn: amount,
        amountOut: formatUnits(BigInt(outputAmount), tokenOutMeta.decimals),
        minimumAmountOut: minimumAmount
          ? formatUnits(BigInt(minimumAmount), tokenOutMeta.decimals)
          : null,
        routing,
        requestId: typeof payload.requestId === "string" ? payload.requestId : null,
        requiresApproval: payload.isTokenApprovalApplicable === true,
        estimatedGasUsd: typeof payload.quote.classicGasUseEstimateUSD === "string"
          ? payload.quote.classicGasUseEstimateUSD
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AGFusion] Uniswap quote proxy failed", { message });
    return NextResponse.json({ error: "uniswap_quote_proxy_failed" }, { status: 502 });
  }
}
