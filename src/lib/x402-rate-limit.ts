import { createHmac } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";
import { emitX402AuditEvent } from "@/lib/x402-audit";

export type X402RateLimitResult =
  | { ok: true; remaining: number; resetAt: string }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "database_unavailable" | "invalid_request" | "configuration_unavailable" };

export type X402RateLimitOptions = {
  /** Stable client identity from a trusted server/platform source, never a raw client body field. */
  identity: string;
  /** Fixed-window request allowance. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  now?: Date;
};

/**
 * Shared fixed-window limiter backed by PostgreSQL.
 *
 * A single INSERT .. ON CONFLICT increment is used so concurrent serverless
 * instances cannot race a read-then-write counter. The identity is HMAC-SHA-256
 * digested with the server-only secret before storage. Any database error fails closed.
 */
export async function consumeX402RateLimit(
  options: X402RateLimitOptions,
): Promise<X402RateLimitResult> {
  const identity = options.identity.trim();
  if (
    !identity ||
    identity.length > 512 ||
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 10_000 ||
    !Number.isSafeInteger(options.windowMs) ||
    options.windowMs < 1_000 ||
    options.windowMs > 24 * 60 * 60 * 1000
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const hmacSecret = process.env.AGFUSION_X402_RATE_LIMIT_SECRET?.trim();
  if (!hmacSecret || hmacSecret.length < 32) {
    return { ok: false, reason: "configuration_unavailable" };
  }
  if (!isDbConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }

  const now = options.now ?? new Date();
  const windowStartMs = Math.floor(now.getTime() / options.windowMs) * options.windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + options.windowMs);
  const keyHash = createHmac("sha256", hmacSecret).update(identity).digest("hex");

  try {
    const rows = await getPrisma().$queryRaw<Array<{ count: number }>>`
      INSERT INTO "X402RateLimitBucket" ("keyHash", "windowStart", "count", "expiresAt")
      VALUES (${keyHash}, ${windowStart}, 1, ${resetAt})
      ON CONFLICT ("keyHash", "windowStart")
      DO UPDATE SET
        "count" = "X402RateLimitBucket"."count" + 1,
        "expiresAt" = EXCLUDED."expiresAt"
      RETURNING "count"
    `;

    const count = Number(rows[0]?.count);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("Rate-limit query returned an invalid counter");
    }

    if (count > options.limit) {
      emitX402AuditEvent("rate_limited", "fixed_window_limit");
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
      };
    }

    return {
      ok: true,
      remaining: options.limit - count,
      resetAt: resetAt.toISOString(),
    };
  } catch (error) {
    emitX402AuditEvent("dependency_unavailable", "rate_limit_database_error");
    return { ok: false, reason: "database_unavailable" };
  }
}

/** Delete expired buckets in bounded batches from a trusted maintenance task. */
export async function pruneExpiredX402RateLimitBuckets(
  options: { now?: Date; batchSize?: number } = {},
): Promise<{ ok: true; deleted: number } | { ok: false; reason: "database_unavailable" | "invalid_request" }> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    return { ok: false, reason: "invalid_request" };
  }
  if (!isDbConfigured()) return { ok: false, reason: "database_unavailable" };

  try {
    const now = options.now ?? new Date();
    const rows = await getPrisma().$queryRaw<Array<{ keyHash: string; windowStart: Date }>>`
      DELETE FROM "X402RateLimitBucket"
      WHERE ("keyHash", "windowStart") IN (
        SELECT "keyHash", "windowStart"
        FROM "X402RateLimitBucket"
        WHERE "expiresAt" <= ${now}
        ORDER BY "expiresAt" ASC
        LIMIT ${batchSize}
      )
      RETURNING "keyHash", "windowStart"
    `;
    return { ok: true, deleted: rows.length };
  } catch (error) {
    emitX402AuditEvent("dependency_unavailable", "rate_limit_cleanup_error");
    return { ok: false, reason: "database_unavailable" };
  }
}
