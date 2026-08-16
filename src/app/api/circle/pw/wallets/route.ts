import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCircleApiKey, isValidUserToken } from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`circle-wallets:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { userToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidUserToken(body.userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }

  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "CIRCLE_API_KEY is not configured" }, { status: 500 });
  }

  const response = await fetch("https://api.circle.com/v1/w3s/wallets", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-User-Token": body.userToken,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message || "Failed to fetch wallets" },
      { status: response.status },
    );
  }

  const wallets = data.data?.wallets || [];
  if (wallets.length === 0) {
    return NextResponse.json({ address: null, wallets: [] });
  }

  // A Circle user can own a wallet per blockchain. Return the full list so
  // the browser can use the correct source-chain wallet for a bridge.
  return NextResponse.json({
    wallets: wallets.map((wallet: { id?: string; address?: string; blockchain?: string; accountType?: string }) => ({
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.accountType,
    })),
    address:
      wallets.find((wallet: { blockchain?: string }) => wallet.blockchain === "ARC-TESTNET")
        ?.address ?? wallets[0].address,
  });
}
