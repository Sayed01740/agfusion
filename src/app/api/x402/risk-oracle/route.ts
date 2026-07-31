/**
 * x402-style paid Risk Oracle API on Arc Testnet.
 *
 * GET  → payment requirements (HTTP 402 shape)
 * POST without payment → 402 + accepts[]
 * POST with paymentTxHash → verify USDC micropayment on Arc → return risk assessment
 *
 * Aligns with Circle agent nanopayments / x402 narrative on Arc.
 */

import { NextResponse } from "next/server";
import { assessRouteRisk } from "@/lib/agent-economy";
import { estimateBridgeDemo } from "@/blockchain/appkit-service";
import type { ChainId } from "@/types";
import { resolveChain } from "@/lib/chains";
import { AGFUSION_DEPLOYER } from "@/lib/onchain";
import { ARC_TESTNET_RPC } from "@/lib/arc-chain";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Micropayment amount in native Arc USDC (18 decimals as wei-like) */
const PRICE_USDC = "0.001";
const PRICE_WEI = BigInt("1000000000000000"); // 0.001 * 1e18

function paymentRequirements(resource: string) {
  return {
    x402Version: 1,
    error: "Payment required",
    accepts: [
      {
        scheme: "exact",
        network: "eip155:5042002",
        maxAmountRequired: PRICE_WEI.toString(),
        amountUsdc: PRICE_USDC,
        asset: "native-USDC",
        payTo: AGFUSION_DEPLOYER,
        resource,
        description: "AGFusion route risk oracle assessment",
        mimeType: "application/json",
        extra: {
          chain: "Arc_Testnet",
          chainId: 5042002,
          explorer: "https://testnet.arcscan.app",
          note: "Send native USDC on Arc to payTo, then retry POST with paymentTxHash",
        },
      },
    ],
  };
}

async function verifyArcPayment(txHash: string, payer?: string): Promise<{
  ok: boolean;
  reason?: string;
  from?: string;
  value?: string;
}> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: "Invalid paymentTxHash" };
  }

  try {
    const res = await fetch(ARC_TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [txHash],
      }),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      result?: {
        from?: string;
        to?: string;
        value?: string;
        hash?: string;
      } | null;
    };
    const tx = data.result;
    if (!tx) return { ok: false, reason: "Transaction not found on Arc" };

    const to = (tx.to || "").toLowerCase();
    const payTo = AGFUSION_DEPLOYER.toLowerCase();
    if (to !== payTo) {
      return {
        ok: false,
        reason: `Payment must be sent to ${AGFUSION_DEPLOYER}`,
      };
    }

    const value = BigInt(tx.value || "0x0");
    if (value < PRICE_WEI) {
      return {
        ok: false,
        reason: `Payment too small. Need ≥ ${PRICE_USDC} USDC (native).`,
      };
    }

    if (payer && tx.from && tx.from.toLowerCase() !== payer.toLowerCase()) {
      return { ok: false, reason: "paymentTxHash from address ≠ payer" };
    }

    // Receipt success
    const rc = await fetch(ARC_TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
      cache: "no-store",
    });
    const rcData = (await rc.json()) as {
      result?: { status?: string } | null;
    };
    if (rcData.result?.status && rcData.result.status !== "0x1") {
      return { ok: false, reason: "Payment transaction failed on-chain" };
    }

    return {
      ok: true,
      from: tx.from,
      value: value.toString(),
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "RPC verify failed",
    };
  }
}

export async function GET() {
  return NextResponse.json(
    paymentRequirements("agfusion://risk-oracle"),
    { status: 402 },
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`x402-risk:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    amount?: string;
    fromChain?: string;
    toChain?: string;
    paymentTxHash?: string;
    payer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amount = String(body.amount || "100");
  const fromChain = (resolveChain(body.fromChain || "Base_Sepolia") ||
    "Base_Sepolia") as ChainId;
  const toChain = (resolveChain(body.toChain || "Arc_Testnet") ||
    "Arc_Testnet") as ChainId;
  const resource = `agfusion://risk-oracle/${fromChain}->${toChain}/${amount}`;

  const paymentTxHash = body.paymentTxHash?.trim();
  if (!paymentTxHash) {
    return NextResponse.json(paymentRequirements(resource), { status: 402 });
  }

  const verified = await verifyArcPayment(paymentTxHash, body.payer);
  if (!verified.ok) {
    return NextResponse.json(
      {
        ...paymentRequirements(resource),
        error: "payment_invalid",
        message: verified.reason,
      },
      { status: 402 },
    );
  }

  const bridgeQuote = estimateBridgeDemo(amount, fromChain, toChain);
  const risk = assessRouteRisk({ fromChain, toChain, amount });
  risk.factors = [
    ...risk.factors,
    `Est. bridge fee ~$${bridgeQuote.feeUsd.toFixed(3)} + gas ~$${bridgeQuote.gasUsd.toFixed(3)}`,
    `ETA ${bridgeQuote.eta} · route ${bridgeQuote.route}`,
    `x402 paid ${PRICE_USDC} USDC · tx ${paymentTxHash.slice(0, 12)}…`,
  ];
  risk.recommendation = `${risk.recommendation} Quoted path: ${bridgeQuote.route} in ${bridgeQuote.eta}.`;

  return NextResponse.json({
    paid: true,
    protocol: "x402",
    payment: {
      txHash: paymentTxHash,
      amountUsdc: PRICE_USDC,
      payTo: AGFUSION_DEPLOYER,
      from: verified.from,
      network: "eip155:5042002",
      explorerUrl: `https://testnet.arcscan.app/tx/${paymentTxHash}`,
    },
    risk,
    quote: bridgeQuote,
    resource,
  });
}
