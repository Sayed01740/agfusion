import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  fetchOwnedWallet,
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

  let body: { userToken?: unknown; walletId?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { userToken, walletId, address } = body;
  if (!isValidUserToken(userToken) || typeof walletId !== "string" || !walletId.trim()) {
    return NextResponse.json({ error: "invalid_parameters" }, { status: 400 });
  }

  if (address !== undefined && !isValidEthereumAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const ownedResult = await fetchOwnedWallet(userToken, walletId.trim());
  if (!ownedResult.ok) {
    return NextResponse.json(
      { error: "unauthorized", detail: ownedResult.reason },
      { status: ownedResult.status },
    );
  }

  const resolvedAddress = (
    ownedResult.wallet.address || (typeof address === "string" ? address : "")
  ).toLowerCase();

  if (!isValidEthereumAddress(resolvedAddress)) {
    return NextResponse.json({ error: "wallet_address_unresolved" }, { status: 400 });
  }

  if (typeof address === "string" && ownedResult.wallet.address) {
    if (address.toLowerCase() !== ownedResult.wallet.address.toLowerCase()) {
      return NextResponse.json({ error: "wallet_address_mismatch" }, { status: 403 });
    }
  }

  const user = await upsertUser(resolvedAddress);
  const token = await createSession(user.id, user.address);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, address: user.address });
}
