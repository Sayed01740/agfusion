#!/usr/bin/env node
/**
 * Live HTTP verification for the dedicated Arc quote-session D1 Worker.
 *
 * Run locally with AGFUSION_QUOTE_SESSION_STORE_URL and
 * AGFUSION_QUOTE_SESSION_STORE_TOKEN in the environment. Never pass the token
 * as a command-line argument or print it. The tests use synthetic SHA-256
 * digests and wallet addresses only; they do not sign or broadcast anything.
 */

import { randomBytes, createHash } from "node:crypto";

const rawUrl = process.env.AGFUSION_QUOTE_SESSION_STORE_URL?.trim();
const apiToken = process.env.AGFUSION_QUOTE_SESSION_STORE_TOKEN?.trim();

if (!rawUrl || !apiToken || apiToken.length < 32) {
  console.error(
    "Missing AGFUSION_QUOTE_SESSION_STORE_URL or AGFUSION_QUOTE_SESSION_STORE_TOKEN (minimum 32 characters).",
  );
  process.exit(2);
}

let baseUrl;
try {
  const parsed = new URL(rawUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("Expected a plain HTTPS Worker origin.");
  }
  baseUrl = parsed.origin;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid Worker URL.");
  process.exit(2);
}

const ACCOUNT_A = "0x1111111111111111111111111111111111111111";
const ACCOUNT_B = "0x2222222222222222222222222222222222222222";
const CHAIN_ID = 5042;
const results = [];

function syntheticDigest() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

async function send(path, payload, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.auth !== false) {
    headers.Authorization = `Bearer ${options.token ?? apiToken}`;
  }
  if (options.contentType !== false) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.rawBody ?? (payload === undefined ? undefined : JSON.stringify(payload)),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body, cacheControl: response.headers.get("cache-control") };
}

function record(name, actual, expected, detail = "") {
  const ok = actual === expected;
  results.push({ name, ok, actual, expected, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}: HTTP ${actual} (expected ${expected})${detail ? `; ${detail}` : ""}`);
  return ok;
}

function expiry(seconds = 120) {
  return Math.floor(Date.now() / 1000) + seconds;
}

try {
  // Authentication must be checked before route or method details are exposed.
  const unauthorized = await send(
    "/v1/sessions/register",
    { tokenHash: syntheticDigest(), account: ACCOUNT_A, chainId: CHAIN_ID, expiresAt: expiry() },
    { auth: false },
  );
  record("missing Bearer token is rejected", unauthorized.status, 401);

  const wrongBearer = await send(
    "/v1/sessions/consume",
    { tokenHash: syntheticDigest(), account: ACCOUNT_A, chainId: CHAIN_ID },
    { token: "incorrect-test-token-that-is-not-the-worker-secret" },
  );
  record("incorrect Bearer token is rejected", wrongBearer.status, 401);

  const unsupportedMethod = await send("/v1/sessions/register", undefined, { method: "GET" });
  record("authenticated unsupported method is rejected", unsupportedMethod.status, 405);

  const malformedHash = await send("/v1/sessions/consume", {
    tokenHash: "not-a-sha256-digest",
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
  });
  record("malformed digest is rejected", malformedHash.status, 400);

  const wrongChain = await send("/v1/sessions/consume", {
    tokenHash: syntheticDigest(),
    account: ACCOUNT_A,
    chainId: 1,
  });
  record("non-Arc chain is rejected", wrongChain.status, 400);

  const expired = await send("/v1/sessions/register", {
    tokenHash: syntheticDigest(),
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: Math.floor(Date.now() / 1000) - 1,
  });
  record("expired registration is rejected", expired.status, 400);

  const excessiveTtl = await send("/v1/sessions/register", {
    tokenHash: syntheticDigest(),
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: expiry(301),
  });
  record("registration over the 300-second TTL is rejected", excessiveTtl.status, 400);

  const oversized = await send("/v1/sessions/register", {
    tokenHash: syntheticDigest(),
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: expiry(),
    padding: "x".repeat(5000),
  });
  record("oversized request body is rejected", oversized.status, 400);

  const concurrentHash = syntheticDigest();
  const registration = await send("/v1/sessions/register", {
    tokenHash: concurrentHash,
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: expiry(),
  });
  record(
    "valid quote session registers",
    registration.status,
    201,
    registration.body?.ok === true ? "ok=true" : "unexpected response body",
  );

  if (registration.status === 201) {
    const payload = { tokenHash: concurrentHash, account: ACCOUNT_A, chainId: CHAIN_ID };
    const concurrent = await Promise.all([
      send("/v1/sessions/consume", payload),
      send("/v1/sessions/consume", payload),
    ]);
    const statuses = concurrent.map((x) => x.status).sort((a, b) => a - b);
    const concurrencyOk = statuses[0] === 200 && statuses[1] === 409;
    results.push({
      name: "exactly one concurrent consume succeeds",
      ok: concurrencyOk,
      actual: statuses.join(","),
      expected: "200,409",
    });
    console.log(
      `[${concurrencyOk ? "PASS" : "FAIL"}] exactly one concurrent consume succeeds: HTTP ${statuses.join(",")} (expected 200,409)`,
    );

    const replay = await send("/v1/sessions/consume", payload);
    record("replay is rejected", replay.status, 409);
  } else {
    results.push({ name: "concurrent consume and replay", ok: false, actual: "skipped", expected: "registration must pass" });
    console.log("[SKIP] concurrent consume and replay: valid registration did not succeed");
  }

  const walletHash = syntheticDigest();
  const walletRegistration = await send("/v1/sessions/register", {
    tokenHash: walletHash,
    account: ACCOUNT_A,
    chainId: CHAIN_ID,
    expiresAt: expiry(),
  });
  record("wallet-binding fixture registers", walletRegistration.status, 201);

  if (walletRegistration.status === 201) {
    const wrongWallet = await send("/v1/sessions/consume", {
      tokenHash: walletHash,
      account: ACCOUNT_B,
      chainId: CHAIN_ID,
    });
    record("wrong wallet cannot consume the session", wrongWallet.status, 409);

    const correctWallet = await send("/v1/sessions/consume", {
      tokenHash: walletHash,
      account: ACCOUNT_A,
      chainId: CHAIN_ID,
    });
    record("correct wallet can consume after mismatch attempt", correctWallet.status, 200);
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\nHTTP verification: ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`Failed checks: ${failed.map((item) => item.name).join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("No wallet signing, transaction submission, or Mainnet action was performed.");
  }
} catch (error) {
  console.error("HTTP verification could not complete:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
