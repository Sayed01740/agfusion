export interface D1RunResult {
  success: boolean;
  meta: { changes: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<D1RunResult>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface Env {
  DB: D1Database;
  API_TOKEN: string;
}

const CHAIN_ID = 5042;
const MAX_SESSION_TTL_SECONDS = 300;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ACCOUNT_PATTERN = /^0x[0-9a-f]{40}$/;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function authorized(request: Request, token: string): boolean {
  if (!token || token.length < 32) return false;
  const header = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), token);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 4096) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function validBinding(body: Record<string, unknown>): boolean {
  return typeof body.tokenHash === "string" &&
    HASH_PATTERN.test(body.tokenHash) &&
    typeof body.account === "string" &&
    ACCOUNT_PATTERN.test(body.account) &&
    body.account === body.account.toLowerCase() &&
    body.chainId === CHAIN_ID;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (!authorized(request, env.API_TOKEN)) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await readBody(request);
  if (!body) return json({ error: "invalid_request" }, 400);
  if (!validBinding(body)) return json({ error: "invalid_binding" }, 400);

  const tokenHash = body.tokenHash as string;
  const account = body.account as string;
  const chainId = body.chainId as number;
  const now = Math.floor(Date.now() / 1000);

  try {
    if (url.pathname === "/v1/sessions/register") {
      const expiresAt = body.expiresAt;
      if (
        !Number.isSafeInteger(expiresAt) ||
        (expiresAt as number) <= now ||
        (expiresAt as number) > now + MAX_SESSION_TTL_SECONDS
      ) {
        return json({ error: "invalid_expiry" }, 400);
      }

      const result = await env.DB.prepare(
        "INSERT INTO arc_quote_sessions (token_hash, account, chain_id, expires_at) VALUES (?, ?, ?, ?)",
      ).bind(tokenHash, account, chainId, expiresAt).run();

      if (!result.success) return json({ error: "storage_unavailable" }, 503);
      return result.meta.changes === 1
        ? json({ ok: true }, 201)
        : json({ error: "session_not_registered" }, 503);
    }

    if (url.pathname === "/v1/sessions/consume") {
      const result = await env.DB.prepare(
        "UPDATE arc_quote_sessions SET consumed_at = ? WHERE token_hash = ? AND account = ? AND chain_id = ? AND expires_at > ? AND consumed_at IS NULL",
      ).bind(now, tokenHash, account, chainId, now).run();

      if (!result.success) return json({ error: "storage_unavailable" }, 503);
      return result.meta.changes === 1
        ? json({ ok: true })
        : json({ error: "invalid_or_consumed_session" }, 409);
    }

    return json({ error: "not_found" }, 404);
  } catch {
    return json({ error: "storage_unavailable" }, 503);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - 86_400;
    await env.DB.prepare(
      "DELETE FROM arc_quote_sessions WHERE token_hash IN (SELECT token_hash FROM arc_quote_sessions WHERE expires_at < ? ORDER BY expires_at LIMIT 500)",
    ).bind(cutoff).run();
  },
};
