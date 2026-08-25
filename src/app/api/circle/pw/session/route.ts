import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCircleApiKey, isValidUserToken } from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Establish the AGFusion server session for an already-authenticated Circle
 * user-controlled wallet. Circle wallets cannot use SIWE/personal_sign, so
 * the Circle user token is verified against Circle's wallet list and the
 * resulting session is bound to the exact wallet address.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`circle-session:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 15,
  });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { userToken?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidUserToken(body.userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(
      { error: "circle_user_token_rejected", message: data?.message || "Circle rejected the wallet session." },
      { status: 401 },
    );
  }

  const wallets = Array.isArray(data?.data?.wallets) ? data.data.wallets : [];
  const ownsAddress = wallets.some(
    (wallet: { address?: unknown }) =>
      typeof wallet.address === "string" && wallet.address.toLowerCase() === address,
  );

  if (!ownsAddress) {
    return NextResponse.json(
      { error: "wallet_mismatch", message: "The Circle session does not own this wallet address." },
      { status: 403 },
    );
  }

  const token = await createSession(`circle_${body.userToken}`, address);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, address });
}
