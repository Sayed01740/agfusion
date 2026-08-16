import { NextResponse } from "next/server";

/**
 * Server-side proxy for Circle's IRIS attestation API
 * (https://iris-api.circle.com/v2/messages/{domain}?transactionHash=…).
 *
 * The Circle App Kit polls this endpoint from the browser during
 * `fetchAttestation`. Proxying it server-side removes the dependency on
 * Circle API CORS behavior and lets the server retry against flaky network
 * paths.
 *
 * Only the production IRIS base URL is allowed — the sandbox endpoint is not
 * used by testnet attestation for the chains AGFusion supports.
 */

const IRIS_BASE = "https://iris-api.circle.com";
const TIMEOUT_MS = 20_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function forward(
  target: string,
  method: string,
  headers: Headers,
  body: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstreamHeaders = new Headers();
    upstreamHeaders.set("Accept", "application/json");
    const contentType = headers.get("content-type");
    if (contentType) upstreamHeaders.set("Content-Type", contentType);
    return await fetch(target, {
      method,
      headers: upstreamHeaders,
      body: body ?? undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || !path.startsWith("/")) {
    return NextResponse.json(
      { error: "missing_path" },
      { status: 400 },
    );
  }
  const target = `${IRIS_BASE}${path}`;
  if (!target.startsWith(`${IRIS_BASE}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  try {
    const upstream = await forward(target, "GET", req.headers, null);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "iris_proxy_error",
        message: e instanceof Error ? e.message : "IRIS proxy failed",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }
  const target = `${IRIS_BASE}${path}`;
  if (!target.startsWith(`${IRIS_BASE}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  try {
    const body = await req.text();
    const upstream = await forward(target, "POST", req.headers, body);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "iris_proxy_error",
        message: e instanceof Error ? e.message : "IRIS proxy failed",
      },
      { status: 502 },
    );
  }
}
