import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { siweVerifySchema } from "@/lib/validation";
import {
  resolveSiweOrigin,
  upsertUser,
  extractAddressFromMessage,
  extractDomainFromMessage,
  extractExpirationFromMessage,
  extractNonceFromMessage,
  isAllowedSiweDomain,
} from "@/lib/siwe";
import { createSession, setSessionCookie } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wallet signature is the authentication proof. Do not require DB/AUTH_SECRET just to verify it. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`verify:${ip}`, { windowMs: 60_000, max: 15 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = siweVerifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { domain } = resolveSiweOrigin(req);
  const message = parsed.data.message;
  const address = extractAddressFromMessage(message);
  const messageDomain = extractDomainFromMessage(message);
  const nonce = extractNonceFromMessage(message);
  const expiration = extractExpirationFromMessage(message);

  if (!address || !nonce || !messageDomain || !isAllowedSiweDomain(messageDomain)) {
    return NextResponse.json({ error: "unauthorized", detail: "Invalid SIWE message." }, { status: 401 });
  }

  if (
    messageDomain.toLowerCase() !== domain.toLowerCase() &&
    messageDomain.toLowerCase().split(":")[0] !== domain.toLowerCase().split(":")[0]
  ) {
    return NextResponse.json({ error: "unauthorized", detail: "Domain mismatch." }, { status: 401 });
  }

  if (!/^[a-fA-F0-9]{32}$/.test(nonce)) {
    return NextResponse.json({ error: "unauthorized", detail: "Invalid nonce." }, { status: 401 });
  }

  if (expiration) {
    const expiresAt = Date.parse(expiration);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      return NextResponse.json({ error: "unauthorized", detail: "Sign-in message expired." }, { status: 401 });
    }
  }

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: parsed.data.signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "unauthorized", detail: "Invalid wallet signature." }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "unauthorized", detail: e instanceof Error ? e.message : "Signature verification failed." },
      { status: 401 },
    );
  }

  const user = await upsertUser(address.toLowerCase());
  const token = await createSession(user.id, user.address);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, address: user.address });
}
