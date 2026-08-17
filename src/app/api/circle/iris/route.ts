import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Server-side proxy for Circle's IRIS CCTP API.
 *
 * AGFusion currently bridges testnet chains, so IRIS sandbox is the correct
 * upstream for CCTP testnet fee/message lookups. Keeping this server-side
 * also avoids browser CORS failures that Circle surfaces as generic
 * "Network connection failed" errors.
 */

const IRIS_BASE = "https://iris-api-sandbox.circle.com";
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

function assertRateLimit(req: Request): Response | null {
  const rl = rateLimit(`circle-iris:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  return null;
}

function getTarget(req: Request): string | Response {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  return `${IRIS_BASE}${path}`;
}

export async function GET(req: Request) {
  const limited = assertRateLimit(req);
  if (limited) return limited;
  const target = getTarget(req);
  if (target instanceof Response) return target;

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
  const limited = assertRateLimit(req);
  if (limited) return limited;
  const target = getTarget(req);
  if (target instanceof Response) return target;

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
