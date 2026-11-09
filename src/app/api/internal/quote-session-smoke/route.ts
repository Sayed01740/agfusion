import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeArcQuoteSession, registerArcQuoteSession } from "@/lib/arc-quote-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY: Preview-only authenticated smoke test. Remove after validation.
const ACCOUNT_A = "0x1111111111111111111111111111111111111111";
const ACCOUNT_B = "0x2222222222222222222222222222222222222222";
const CHAIN_ID = 5042;

function authorized(request: Request): boolean {
  if (process.env.VERCEL_ENV !== "preview") return false;
  const expected = process.env.AGFUSION_QUOTE_SESSION_SMOKE_TEST_TOKEN || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function digest(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const workerUrl = process.env.AGFUSION_QUOTE_SESSION_STORE_URL?.trim();
  const workerToken = process.env.AGFUSION_QUOTE_SESSION_STORE_TOKEN?.trim();
  if (!workerUrl || !workerToken || workerToken.length < 32) {
    return NextResponse.json({ error: "worker_configuration_missing" }, { status: 503 });
  }

  const checks: Array<{ name: string; passed: boolean; actual: number | string; expected: number | string }> = [];
  const record = (name: string, actual: number | string, expected: number | string) => {
    checks.push({ name, actual, expected, passed: actual === expected });
  };

  async function workerRequest(
    path: string,
    payload?: unknown,
    options: { auth?: string | null; method?: string; rawBody?: string } = {},
  ): Promise<number> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.auth !== null) headers.Authorization = `Bearer ${options.auth ?? workerToken}`;
    if (options.method !== "GET") headers["Content-Type"] = "application/json";
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}${path}`, {
      method: options.method ?? "POST",
      headers,
      body: options.rawBody ?? (payload === undefined ? undefined : JSON.stringify(payload)),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.status;
  }

  const now = Math.floor(Date.now() / 1000);
  record("missing Bearer token", await workerRequest("/v1/sessions/register", {
    tokenHash: digest(), account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now + 120,
  }, { auth: null }), 401);
  record("wrong Bearer token", await workerRequest("/v1/sessions/consume", {
    tokenHash: digest(), account: ACCOUNT_A, chainId: CHAIN_ID,
  }, { auth: "incorrect-smoke-test-token-that-is-not-a-secret" }), 401);
  record("authenticated unsupported method", await workerRequest("/v1/sessions/register", undefined, { method: "GET" }), 405);
  record("malformed digest", await workerRequest("/v1/sessions/consume", {
    tokenHash: "not-a-sha256-digest", account: ACCOUNT_A, chainId: CHAIN_ID,
  }), 400);
  record("wrong chain", await workerRequest("/v1/sessions/consume", {
    tokenHash: digest(), account: ACCOUNT_A, chainId: 1,
  }), 400);
  record("expired registration", await workerRequest("/v1/sessions/register", {
    tokenHash: digest(), account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now - 1,
  }), 400);
  record("TTL greater than 300 seconds", await workerRequest("/v1/sessions/register", {
    tokenHash: digest(), account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now + 301,
  }), 400);
  record("oversized request body", await workerRequest("/v1/sessions/register", undefined, {
    rawBody: JSON.stringify({ tokenHash: digest(), account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now + 120, padding: "x".repeat(5000) }),
  }), 400);

  const concurrentHash = digest();
  const registerStatus = await workerRequest("/v1/sessions/register", {
    tokenHash: concurrentHash, account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now + 120,
  });
  record("valid registration", registerStatus, 201);
  if (registerStatus === 201) {
    const payload = { tokenHash: concurrentHash, account: ACCOUNT_A, chainId: CHAIN_ID };
    const statuses = await Promise.all([
      workerRequest("/v1/sessions/consume", payload),
      workerRequest("/v1/sessions/consume", payload),
    ]);
    record("exactly one concurrent consume succeeds", statuses.slice().sort((a, b) => a - b).join(","), "200,409");
    record("replay rejected", await workerRequest("/v1/sessions/consume", payload), 409);
  } else {
    record("exactly one concurrent consume succeeds", "skipped", "200,409");
    record("replay rejected", "skipped", 409);
  }

  const walletHash = digest();
  const walletRegistration = await workerRequest("/v1/sessions/register", {
    tokenHash: walletHash, account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: now + 120,
  });
  record("wallet fixture registration", walletRegistration, 201);
  if (walletRegistration === 201) {
    record("wrong wallet rejected", await workerRequest("/v1/sessions/consume", {
      tokenHash: walletHash, account: ACCOUNT_B, chainId: CHAIN_ID,
    }), 409);
    record("correct wallet can still consume", await workerRequest("/v1/sessions/consume", {
      tokenHash: walletHash, account: ACCOUNT_A, chainId: CHAIN_ID,
    }), 200);
  } else {
    record("wrong wallet rejected", "skipped", 409);
    record("correct wallet can still consume", "skipped", 200);
  }

  const appToken = `app-wrapper-${randomBytes(32).toString("hex")}-opaque-quote-session`;
  const appRegistered = await registerArcQuoteSession({
    token: appToken,
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: Math.floor(Date.now() / 1000) + 120,
  });
  record("application wrapper registers against Worker", appRegistered.ok ? "ok" : appRegistered.reason, "ok");
  if (appRegistered.ok) {
    const appConsume = await Promise.all([
      consumeArcQuoteSession({ token: appToken, account: ACCOUNT_A, chainId: CHAIN_ID }),
      consumeArcQuoteSession({ token: appToken, account: ACCOUNT_A, chainId: CHAIN_ID }),
    ]);
    const winners = appConsume.filter((result) => result.ok).length;
    const losers = appConsume.filter((result) => !result.ok && result.reason === "invalid_or_consumed_session").length;
    record("application wrapper concurrent consume", `${winners},${losers}`, "1,1");
  } else {
    record("application wrapper concurrent consume", "skipped", "1,1");
  }

  const failures = checks.filter((check) => !check.passed);
  return NextResponse.json({
    ok: failures.length === 0,
    passed: checks.length - failures.length,
    total: checks.length,
    checks,
    note: "Synthetic test fixtures only. No wallet signing or transaction broadcast.",
  }, { status: failures.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
