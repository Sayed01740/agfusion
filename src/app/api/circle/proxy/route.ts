/**
 * Server-side proxy for the one Circle Stablecoin Kit operation AGFusion
 * currently uses. Never expose the server Kit key or an arbitrary Circle API
 * surface to the browser.
 */

import { NextResponse } from "next/server";
import { getServerKitKey } from "@/lib/circle-kit-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CIRCLE_API_ORIGIN = "https://api.circle.com";
const SWAP_PATH = "/v1/stablecoinKits/swap";
const MAX_BODY_BYTES = 64 * 1024;

function assertRateLimit(req: Request): Response | null {
  const rl = rateLimit(`circle-proxy:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return null;
}

function isAllowedRequest(req: Request): boolean {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  return req.method.toUpperCase() === "POST" && path === SWAP_PATH;
}

async function proxy(req: Request): Promise<Response> {
  const limited = assertRateLimit(req);
  if (limited) return limited;

  // IMPORTANT: do not turn this route into a generic Circle API proxy.
  // A client-controlled path + server Kit key is effectively a privileged
  // API gateway. Keep the allowlist exact and method-specific.
  if (!isAllowedRequest(req)) {
    return NextResponse.json(
      {
        error: "endpoint_not_allowed",
        message: "Only POST /v1/stablecoinKits/swap is available through this proxy.",
      },
      { status: 403 },
    );
  }

  const bearer = getServerKitKey();
  if (!bearer) {
    return NextResponse.json(
      {
        error: "missing_kit_key",
        message: "Circle Kit key is not configured on the server.",
      },
      { status: 503 },
    );
  }

  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large" },
      { status: 413 },
    );
  }

  // Require JSON so callers cannot use this endpoint as an arbitrary byte
  // forwarder. Circle validates the actual swap schema upstream.
  try {
    JSON.parse(body || "{}");
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${CIRCLE_API_ORIGIN}${SWAP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
      },
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json";

    if (upstream.status === 401 || upstream.status === 403) {
      let message = text;
      try {
        const j = JSON.parse(text) as { message?: string };
        message = j.message || text;
      } catch {
        /* keep */
      }
      console.warn("[circle-proxy] Circle rejected server Kit key", {
        status: upstream.status,
        message: message?.slice?.(0, 160),
      });
      return NextResponse.json(
        {
          error: "kit_key_rejected",
          message: "Circle rejected the server Kit key.",
          status: upstream.status,
        },
        { status: upstream.status },
      );
    }

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        message:
          e instanceof Error
            ? e.message
            : "Could not reach Circle Stablecoin Kit API",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  return proxy(req);
}

export async function GET(req: Request) {
  return proxy(req);
}

export async function PUT(req: Request) {
  return proxy(req);
}

export async function PATCH(req: Request) {
  return proxy(req);
}

export async function DELETE(req: Request) {
  return proxy(req);
}
