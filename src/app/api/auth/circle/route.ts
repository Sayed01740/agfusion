import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/read-limited-json";
import {
  fetchOwnedWallet,
  getCircleApiKey,
  isValidEthereumAddress,
  isValidUserToken,
} from "@/lib/circle-pw-server";
import { upsertUser } from "@/lib/siwe";
import { createSession, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Circle User-Controlled Wallet ownership and create an authenticated session.
 * Circle Programmable Wallets sign actions via PIN/biometric challenge rather than EIP-191/SIWE,
 * so wallet ownership is verified against Circle's authenticated API using the userToken and walletId.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`circle-auth:${ip}`, { windowMs: 60_000, max: 20 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const bodyResult = await readLimitedJson(req, 16 * 1024);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.reason === "too_large" ? "request_too_large" : "invalid_request" },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }
  const raw = bodyResult.value;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const body = raw as { userToken?: unknown; walletId?: unknown; address?: unknown };

  const { userToken, walletId, address } = body;
  if (!isValidUserToken(userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }

  if (address !== undefined && !isValidEthereumAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const apiKey = getCircleApiKey();
  let resolvedAddress = "";

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[circle-auth] Local development mode: CIRCLE_API_KEY not configured, creating dev session for", address);
      resolvedAddress = typeof address === "string" ? address.toLowerCase() : "";
      if (!isValidEthereumAddress(resolvedAddress)) {
        return NextResponse.json({ error: "invalid_address", message: "Valid address is required for local Circle auth." }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: "circle_config_missing", message: "CIRCLE_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }
  } else {
    const wId = typeof walletId === "string" ? walletId.trim() : "";
    if (wId) {
      const ownedResult = await fetchOwnedWallet(userToken, wId);
      if (!ownedResult.ok) {
        return NextResponse.json(
          { error: "unauthorized", message: ownedResult.reason },
          { status: ownedResult.status },
        );
      }
      resolvedAddress = (
        ownedResult.wallet.address || (typeof address === "string" ? address : "")
      ).toLowerCase();
    } else if (typeof address === "string" && isValidEthereumAddress(address)) {
      resolvedAddress = address.toLowerCase();
    } else {
      return NextResponse.json({ error: "invalid_parameters", message: "walletId or address is required" }, { status: 400 });
    }
  }

  if (!isValidEthereumAddress(resolvedAddress)) {
    return NextResponse.json({ error: "wallet_address_unresolved" }, { status: 400 });
  }

  const user = await upsertUser(resolvedAddress);
  const token = await createSession(user.id, user.address);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, address: user.address });
}
