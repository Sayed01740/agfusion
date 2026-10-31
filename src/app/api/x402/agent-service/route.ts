import { NextResponse } from "next/server";

/**
 * x402 Agent Service remains intentionally disabled. No recipient or payment
 * instructions are advertised until server configuration, schema rollout,
 * and activation review are complete.
 */
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
        rpc: "https://rpc.testnet.arc.network",
        explorer: "https://testnet.arcscan.app",
      },
      description:
        "The paid agent feed is temporarily unavailable. No recipient or payment instructions are published. Do not send funds for this endpoint.",
    },
    {
      status: 402,
      headers: {
        "X-Payment-Required": "true",
        "X-Payment-Enabled": "false",
        "X-Payment-Token": "USDC",
        "X-Payment-Amount": "0.001",
        "X-Payment-Decimals": "6",
        "X-Payment-ChainId": "5042002",
      },
    },
  );
}

export async function GET() {
  return paymentRequired();
}

export async function POST(_request: Request) {
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
