import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCircleApiKey,
  isValidBlockchain,
  isValidUserToken,
} from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`circle-challenge:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 15,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { userToken?: unknown; blockchains?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidUserToken(body.userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }

  // Only blockchains this app supports for Circle PW may be requested.
  const blockchains = Array.isArray(body.blockchains) ? body.blockchains : [];
  if (
    blockchains.length === 0 ||
    !blockchains.every((b) => isValidBlockchain(b))
  ) {
    return NextResponse.json({ error: "invalid_blockchains" }, { status: 400 });
  }

  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "CIRCLE_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Call Circle API to create a wallet challenge
  const idempotencyKey = randomUUID();
  let response = await fetch("https://api.circle.com/v1/w3s/user/wallets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-User-Token": body.userToken,
    },
    body: JSON.stringify({
      idempotencyKey,
      blockchains,
      accountType: "SCA",
    }),
  });

  let data = await response.json();

  // If the user hasn't set up a PIN, create a PIN setup challenge instead
  if (!response.ok && data?.message?.includes("User has not set up a PIN yet")) {
    response = await fetch("https://api.circle.com/v1/w3s/user/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-User-Token": body.userToken,
      },
      body: JSON.stringify({ idempotencyKey: randomUUID() }),
    });
    data = await response.json();
  }

  if (!response.ok) {
    console.error("[Circle PW] Wallet/PIN Creation Error:", data);
    return NextResponse.json(
      { error: data.message || "Failed to create Circle challenge" },
      { status: response.status },
    );
  }

  return NextResponse.json({
    challengeId: data.data.challengeId,
  });
}
