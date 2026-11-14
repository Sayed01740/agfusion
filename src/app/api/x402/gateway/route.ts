import { NextResponse } from "next/server";
import { getArcNetworkMeta } from "@/lib/arc-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Circle Gateway Nanopayments & Agent Marketplace discovery endpoint.
 * Advertises x402 v2 / Gateway Nanopayments requirements when a payout address
 * is explicitly configured on the server; fails closed otherwise.
 */
export async function GET(request: Request) {
  const payoutAddress = process.env.X402_PAYOUT_ADDRESS?.trim();
  if (!payoutAddress || !/^0x[a-fA-F0-9]{40}$/.test(payoutAddress)) {
    return NextResponse.json(
      {
        error: "gateway_payout_unconfigured",
        code: "X402_PAYOUT_UNCONFIGURED",
        message:
          "Circle Gateway Nanopayments payout address (X402_PAYOUT_ADDRESS) is not configured on this server.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const chainIdParam = Number(url.searchParams.get("chainId"));
  const meta = getArcNetworkMeta(Number.isFinite(chainIdParam) ? chainIdParam : undefined);

  return NextResponse.json(
    {
      x402Version: 2,
      gateway: "circle-nanopayments",
      provider: "AGFusion",
      service: {
        name: "AGFusion Arc Route & Liquidity Oracle",
        category: "defi-infrastructure",
        endpoint: "/api/x402/gateway",
        method: "GET",
        priceUsdc: "0.001",
      },
      accepts: [
        {
          scheme: "exact",
          network: `eip155:${meta.chainId}`,
          chainName: meta.name,
          asset: "0x3600000000000000000000000000000000000000",
          symbol: "USDC",
          maxAmountRequired: "1000", // 0.001 USDC (6 decimals)
          payTo: payoutAddress,
          facilitator: "circle-gateway-nanopayments",
        },
      ],
    },
    {
      status: 402,
      headers: {
        "Cache-Control": "no-store",
        "X-Payment-Gateway": "circle-nanopayments",
        "X-Payment-Token": "USDC",
        "X-Payment-Amount": "0.001",
        "X-Payment-ChainId": String(meta.chainId),
      },
    },
  );
}
