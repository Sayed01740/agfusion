import { NextResponse } from "next/server";
import { siweVerifySchema } from "@/lib/validation";
import {
  resolveSiweOrigin,
  upsertUser,
  verifySiwe,
} from "@/lib/siwe";
import { createSession, setSessionCookie } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify a server-issued EIP-4361 SIWE challenge and create a session. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`verify:${ip}`, { windowMs: 60_000, max: 15 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = siweVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { domain, uri } = resolveSiweOrigin(req);
  const result = await verifySiwe({
    message: parsed.data.message,
    signature: parsed.data.signature as `0x${string}`,
    expectedDomain: domain,
    expectedUri: uri,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "unauthorized", detail: result.error },
      { status: 401 },
    );
  }

  const user = await upsertUser(result.address);
  const token = await createSession(user.id, user.address);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, address: user.address });
}
