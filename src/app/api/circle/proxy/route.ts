/**
 * Proxy Circle Stablecoin Service so browser App Kit never hits api.circle.com CORS/8002.
 * ALWAYS authenticates with server KIT_KEY (never trust client Authorization).
 */

import { NextResponse } from "next/server";
import { getServerKitKey } from "@/lib/circle-kit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIX = "/v1/stablecoinKits/";

function resolvePath(req: Request): string | null {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || !path.startsWith(ALLOWED_PREFIX)) return null;
  if (path.includes("..")) return null;
  return path;
}

async function proxy(req: Request): Promise<Response> {
  const path = resolvePath(req);
  if (!path) {
    return NextResponse.json(
      { error: "invalid_path", message: "Only /v1/stablecoinKits/* is allowed" },
      { status: 400 },
    );
  }

  const bearer = getServerKitKey();
  if (!bearer) {
    return NextResponse.json(
      {
        error: "missing_kit_key",
        message:
          "KIT_KEY not set on server. Add KIT_KEY on Vercel and redeploy.",
      },
      { status: 401 },
    );
  }

  const target = `https://api.circle.com${path}`;
  const method = req.method.toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.text();
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
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
      console.warn("[circle-proxy] 401/403", message?.slice?.(0, 160));
      return NextResponse.json(
        {
          error: "kit_key_rejected",
          message:
            "Circle rejected KIT_KEY (Invalid credentials). The key on Vercel is wrong, revoked, or not a Kit key. Create a new one at console.circle.com → Keys → Kit keys, update KIT_KEY + NEXT_PUBLIC_KIT_KEY, redeploy.",
          circleMessage: message || undefined,
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        message: `Could not reach api.circle.com: ${msg}`,
      },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  return proxy(req);
}
export async function POST(req: Request) {
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
