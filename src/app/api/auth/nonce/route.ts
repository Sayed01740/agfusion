import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import {
  buildSiweMessage,
  issueNonce,
  resolveSiweOrigin,
  isAllowedSiweDomain,
  SIWE_STATEMENT,
} from "@/lib/siwe";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function GET(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`nonce:${ip}`, { windowMs: 60_000, max: 30 });
    if (!rl.ok) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      address: url.searchParams.get("address"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { domain, uri } = resolveSiweOrigin(req);
    if (!isAllowedSiweDomain(domain)) {
      return NextResponse.json({ error: "untrusted_host" }, { status: 403 });
    }

    let address: string;
    try {
      address = getAddress(parsed.data.address);
    } catch {
      return NextResponse.json({ error: "invalid_address" }, { status: 400 });
    }

    const nonce = await issueNonce(address);
    const message = buildSiweMessage({
      address,
      nonce,
      domain,
      uri,
    });

    return NextResponse.json({
      message,
      nonce,
      meta: {
        domain,
        uri,
        statement: SIWE_STATEMENT,
        type: "eip4361_siwe",
      },
    });
  } catch (e) {
    console.error("[auth/nonce]", e);
    return NextResponse.json(
      {
        error: "nonce_failed",
        message: "Could not create sign-in challenge. Try again.",
      },
      { status: 500 },
    );
  }
}
