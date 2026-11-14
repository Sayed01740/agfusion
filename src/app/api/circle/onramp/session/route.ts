import { NextResponse } from "next/server";
import { createAppServerKit, KitError } from "@circle-fin/app-kit/server";
import { getSessionUser } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIT_STATUS: Record<string, number> = {
  INPUT: 400,
  RATE_LIMIT: 429,
  NETWORK: 504,
  SERVICE: 502,
  RPC: 502,
};

function isValidEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/**
 * Mints a short-lived Circle Onramp session on the server so CIRCLE_API_KEY
 * and ONRAMP_REFERRER_DOMAIN never reach the browser.
 */
export async function POST(request: Request) {
  const rl = rateLimit(`onramp-session:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many onramp session requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Circle Onramp is not configured on this server (missing CIRCLE_API_KEY).",
        code: "ONRAMP_NOT_CONFIGURED",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const destinationAddress = (body as { destinationAddress?: unknown })
    .destinationAddress;
  if (!isValidEvmAddress(destinationAddress)) {
    return NextResponse.json(
      { error: "A valid 0x destinationAddress is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await getSessionUser();
  if (
    session?.address &&
    session.address.toLowerCase() !== destinationAddress.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "destinationAddress does not match the signed-in wallet." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const normalizedAddress = destinationAddress.trim().toLowerCase();
  const appUserId = session?.address
    ? `agfusion:${session.address.toLowerCase()}`
    : `agfusion:${normalizedAddress}`;

  const rawAssets = (body as { assets?: unknown }).assets;
  const assets = Array.isArray(rawAssets)
    ? rawAssets.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : undefined;

  try {
    const server = createAppServerKit({
      onramp: {
        apiKey,
        referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN?.trim() || undefined,
        baseUrl: process.env.ONRAMP_API_BASE_URL?.trim() || undefined,
        widgetBaseUrl:
          process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL?.trim() || undefined,
      },
    });

    const onrampSession = await server.onramp.createSession({
      appUserId,
      destinationAddress: destinationAddress.trim(),
      ...(assets && assets.length > 0 ? { assets } : {}),
    });

    return NextResponse.json(onrampSession, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof KitError) {
      return NextResponse.json(
        { error: error.message, code: error.type },
        {
          status: KIT_STATUS[error.type] ?? 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to mint Circle Onramp session.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
