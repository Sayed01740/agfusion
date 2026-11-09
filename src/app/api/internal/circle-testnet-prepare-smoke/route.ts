import { NextResponse } from "next/server";
import { POST as prepareCircleSwap } from "@/app/api/circle/swap/prepare/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY: Preview-only trigger for the Circle Arc Testnet estimate route.
// Uses a synthetic wallet. Does not sign, approve, prepare calldata, or submit a transaction.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const request = new Request("https://preview.invalid/api/circle/swap/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: "0x1111111111111111111111111111111111111111",
      amount: "0.01",
      tokenIn: "USDC",
      tokenOut: "EURC",
      chainId: 5042002,
    }),
  });

  const response = await prepareCircleSwap(request);
  const payload = await response.json().catch(() => ({ error: "invalid_response" }));
  return NextResponse.json({
    routeStatus: response.status,
    payload,
    testOnly: true,
    safety: { walletSigning: false, approval: false, transactionSubmission: false, broadcast: false },
  }, { headers: { "Cache-Control": "no-store" } });
}
