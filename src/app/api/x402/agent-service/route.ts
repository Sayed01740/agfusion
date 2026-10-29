import { NextResponse } from "next/server";
import { getPrisma, isDbConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { IS_ARC_MAINNET } from "@/lib/arc-chain";

/**
 * HTTP 402 payment-gated endpoint for the Arc Testnet agent telemetry demo.
 * Authorization requires a successful on-chain payment on the advertised chain.
 */

const SERVICE_RECIPIENT =
  process.env.NEXT_PUBLIC_AGFUSION_REGISTRY ||
  "0x76bb5678ec11ae94b34ed9cf90b25c9eea440483";
const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const PRICE_WEI = 1_000_000_000_000_000n; // 0.001 native USDC at 18 decimals

export async function GET(req: Request) {
  return handleX402(req);
}

export async function POST(req: Request) {
  return handleX402(req);
}

function paymentRequired(reason?: string) {
  return NextResponse.json(
    {
      protocol: "x402-v1",
      status: 402,
      title: "Payment Required for AI Agent Telemetry",
      ...(reason ? { reason } : {}),
      price: {
        amount: "0.001",
        asset: "USDC",
        decimals: 18,
        fiatEquivalentUsd: "$0.001",
      },
      settlement: {
        chain: "Arc Testnet",
        chainId: ARC_TESTNET_CHAIN_ID,
        recipient: SERVICE_RECIPIENT,
        rpc: ARC_TESTNET_RPC,
        explorer: "https://testnet.arcscan.app",
      },
      description:
        "High-frequency algorithmic liquidity and routing intelligence feed. Pay 0.001 USDC on Arc Testnet.",
      instructions:
        "Execute a 0.001 native USDC payment on Arc Testnet to the settlement recipient, then resubmit with header 'X-Payment-Tx: <txHash>'.",
    },
    {
      status: 402,
      headers: {
        "X-Payment-Required": "true",
        "X-Payment-Token": "USDC",
        "X-Payment-Amount": "0.001",
        "X-Payment-Recipient": SERVICE_RECIPIENT,
        "X-Payment-ChainId": String(ARC_TESTNET_CHAIN_ID),
      },
    },
  );
}

async function verifyPayment(txHash: string): Promise<{ ok: boolean; reason?: string }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: "Invalid payment transaction hash." };
  }

  try {
    const rpc = async (method: string, params: unknown[]) => {
      const response = await fetch(ARC_TESTNET_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Arc Testnet RPC request failed.");
      const payload = (await response.json()) as {
        result?: any;
        error?: { message?: string };
      };
      if (payload.error) throw new Error(payload.error.message || "Arc Testnet RPC error.");
      return payload.result;
    };

    const chainId = await rpc("eth_chainId", []);
    if (BigInt(String(chainId || "0x0")) !== BigInt(ARC_TESTNET_CHAIN_ID)) {
      return { ok: false, reason: "Payment verification RPC is not on Arc Testnet." };
    }

    const tx = await rpc("eth_getTransactionByHash", [txHash]);
    if (!tx || String(tx.hash || "").toLowerCase() !== txHash.toLowerCase()) {
      return { ok: false, reason: "Payment transaction not found on Arc Testnet." };
    }
    if (String(tx.to || "").toLowerCase() !== SERVICE_RECIPIENT.toLowerCase()) {
      return { ok: false, reason: "Payment recipient does not match the required recipient." };
    }

    let value: bigint;
    try {
      value = BigInt(String(tx.value || "0x0"));
    } catch {
      return { ok: false, reason: "Payment transaction has an invalid value." };
    }
    if (value < PRICE_WEI) {
      return { ok: false, reason: "Payment is below the required 0.001 USDC amount." };
    }

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt || String(receipt.transactionHash || "").toLowerCase() !== txHash.toLowerCase()) {
      return { ok: false, reason: "Payment transaction is not confirmed yet." };
    }
    if (String(receipt.status || "").toLowerCase() !== "0x1") {
      return { ok: false, reason: "Payment transaction failed on-chain." };
    }
    return { ok: true };
  } catch (error) {
    console.warn("[AGFusion][x402] payment verification failed closed", error);
    return { ok: false, reason: "Payment verification is temporarily unavailable; access was not granted." };
  }
}

async function handleX402(req: Request) {
  // This telemetry demo is explicitly Testnet-only. Fail closed on Mainnet
  // rather than advertising a Testnet recipient/chain from a production build.
  if (IS_ARC_MAINNET) {
    return NextResponse.json(
      { error: "service_unavailable", reason: "This x402 telemetry demo is configured for Arc Testnet only." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`x402-agent-service:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const paymentTx = req.headers.get("x-payment-tx");

  // Session headers are not accepted as authentication until a real session
  // token verifier is configured. Never trust the presence of a header alone.
  if (!paymentTx) return paymentRequired();

  const verification = await verifyPayment(paymentTx);
  if (!verification.ok) return paymentRequired(verification.reason);

  // A confirmed payment is single-use for this endpoint. Require persistent
  // storage and a unique tx hash so concurrent replays cannot both succeed.
  if (!isDbConfigured()) {
    return paymentRequired("Payment replay protection requires the database to be configured.");
  }
  try {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "X402Payment" (
        "id" TEXT PRIMARY KEY,
        "txHash" TEXT NOT NULL UNIQUE,
        "resource" TEXT NOT NULL,
        "payer" TEXT,
        "amountWei" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "X402Payment" ("id", "txHash", "resource", "payer", "amountWei") VALUES ($1, $2, $3, $4, $5)`,
      `x402_agent_${crypto.randomUUID()}`,
      paymentTx.toLowerCase(),
      "agfusion://agent-service",
      null,
      PRICE_WEI.toString(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = /unique|duplicate/i.test(message)
      ? "This payment transaction has already been consumed."
      : "Could not persist payment replay protection; access was not granted.";
    console.warn("[AGFusion][x402] payment consumption failed closed", error);
    return paymentRequired(reason);
  }

  return NextResponse.json(
    {
      status: 200,
      protocol: "x402-v1",
      authorized: true,
      paymentProof: paymentTx,
      timestamp: Date.now(),
      data: {
        agentFeedId: "arc-intel-stream-alpha",
        networkHealth: "optimal",
        arcTestnetBlockTimeMs: 400,
        averageGasCostUsdc: "0.00012",
        crossChainLiquidityCctp: {
          arcToSepoliaAvailable: "1,500,000 USDC",
          settlementLatencySec: 12,
        },
        recommendedRoutes: [
          { token: "USDC", pool: "Uniswap-V2-Arc", slippageBps: 2 },
          { token: "EURC", pool: "Circle-Native", slippageBps: 4 },
        ],
        agentTelemetry: {
          activeErc8004Agents: 42,
          totalMicropaymentsSettledToday: 1384,
          savingsVsEthereumL1: "99.98%",
        },
      },
    },
    {
      status: 200,
      headers: {
        "X-Payment-Status": "Settled",
        "X-Arc-Network": String(ARC_TESTNET_CHAIN_ID),
      },
    },
  );
}
