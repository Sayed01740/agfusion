import { NextResponse } from "next/server";

/**
 * x402 Agent Service.
 *
 * This endpoint is intentionally fail-closed until on-chain ERC-20 payment
 * verification and replay protection are implemented. A client-supplied
 * transaction hash or browser-local session policy is not payment proof.
 */

const SERVICE_RECIPIENT =
  process.env.NEXT_PUBLIC_AGFUSION_REGISTRY ||
  "0x76bb5678ec11ae94b34ed9cf90b25c9eea440483";

function paymentRequired() {
  return NextResponse.json(
    {
      protocol: "x402-v1",
      status: 402,
      title: "Payment verification is not yet available",
      paymentEnabled: false,
      price: {
        amount: "0.001",
        asset: "USDC",
        decimals: 6,
      },
      settlement: {
        chain: "Arc Testnet",
        chainId: 5042002,
        token: "0x3600000000000000000000000000000000000000",
        recipient: SERVICE_RECIPIENT,
        rpc: "https://rpc.testnet.arc.network",
        explorer: "https://testnet.arcscan.app",
      },
      description:
        "The paid agent feed is temporarily unavailable while on-chain payment verification is being implemented. Do not send funds for this endpoint.",
    },
    {
      status: 402,
      headers: {
        "X-Payment-Required": "true",
        "X-Payment-Enabled": "false",
        "X-Payment-Token": "USDC",
        "X-Payment-Amount": "0.001",
        "X-Payment-Decimals": "6",
        "X-Payment-Recipient": SERVICE_RECIPIENT,
        "X-Payment-ChainId": "5042002",
      },
    },
  );
}

export async function GET() {
  return paymentRequired();
}

export async function POST() {
  // Never trust x-payment-tx or x-session-auth until independently verified.
  return NextResponse.json(
    {
      protocol: "x402-v1",
      error: "payment_verification_unavailable",
      paymentEnabled: false,
      message:
        "Payment verification is not yet available. No payment credential has been accepted and no agent feed has been unlocked.",
    },
    {
      status: 503,
      headers: {
        "X-Payment-Status": "Unavailable",
        "X-Arc-Network": "5042002",
      },
    },
  );
}
