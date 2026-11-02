import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(),
}));

import { getPrisma, isDbConfigured } from "@/lib/db";
import {
  consumeX402RateLimit,
  pruneExpiredX402RateLimitBuckets,
} from "./x402-rate-limit";

const configured = vi.mocked(isDbConfigured);
const prisma = vi.mocked(getPrisma);
const now = new Date("2026-11-01T12:34:56.000Z");

beforeEach(() => vi.stubEnv("AGFUSION_X402_RATE_LIMIT_SECRET", "test-secret-".padEnd(40, "x")));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("consumeX402RateLimit", () => {
  it("increments a shared fixed-window bucket atomically and hashes the identity", async () => {
    configured.mockReturnValue(true);
    const queryRaw = vi.fn().mockResolvedValue([{ count: 2 }]);
    prisma.mockReturnValue({ $queryRaw: queryRaw } as never);

    await expect(consumeX402RateLimit({
      identity: "trusted-client-ip",
      limit: 5,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({
      ok: true,
      remaining: 3,
      resetAt: "2026-11-01T12:35:00.000Z",
    });

    expect(queryRaw).toHaveBeenCalledOnce();
    const values = queryRaw.mock.calls[0].slice(1);
    expect(values).not.toContain("trusted-client-ip");
    const dates = values.filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime());
    expect(dates).toContain(new Date("2026-11-01T12:34:00.000Z").getTime());
    expect(dates).toContain(new Date("2026-11-01T12:35:00.000Z").getTime());
  });

  it("rejects requests after the fixed-window limit is reached", async () => {
    configured.mockReturnValue(true);
    prisma.mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([{ count: 6 }]),
    } as never);

    await expect(consumeX402RateLimit({
      identity: "client-1",
      limit: 5,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 4,
    });
  });

  it("fails closed when the HMAC secret is missing", async () => {
    vi.stubEnv("AGFUSION_X402_RATE_LIMIT_SECRET", "");
    configured.mockReturnValue(true);

    await expect(consumeX402RateLimit({
      identity: "client-1", limit: 5, windowMs: 60_000, now,
    })).resolves.toEqual({ ok: false, reason: "configuration_unavailable" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("fails closed when PostgreSQL is not configured", async () => {
    configured.mockReturnValue(false);

    await expect(consumeX402RateLimit({
      identity: "client-1",
      limit: 5,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("rejects invalid limits and identities before database access", async () => {
    configured.mockReturnValue(true);

    await expect(consumeX402RateLimit({
      identity: " ",
      limit: 5,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({ ok: false, reason: "invalid_request" });

    await expect(consumeX402RateLimit({
      identity: "client-1",
      limit: 0,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("fails closed on database errors", async () => {
    configured.mockReturnValue(true);
    prisma.mockReturnValue({
      $queryRaw: vi.fn().mockRejectedValue(new Error("database offline")),
    } as never);
    const warn = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(consumeX402RateLimit({
      identity: "client-1",
      limit: 5,
      windowMs: 60_000,
      now,
    })).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("pruneExpiredX402RateLimitBuckets", () => {
  it("deletes expired buckets in a bounded batch", async () => {
    configured.mockReturnValue(true);
    const queryRaw = vi.fn().mockResolvedValue([{ keyHash: "hash-1", windowStart: now }]);
    prisma.mockReturnValue({ $queryRaw: queryRaw } as never);

    await expect(pruneExpiredX402RateLimitBuckets({
      now,
      batchSize: 100,
    })).resolves.toEqual({ ok: true, deleted: 1 });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw.mock.calls[0]).toContain(now);
    expect(queryRaw.mock.calls[0]).toContain(100);
  });

  it("rejects unbounded cleanup requests", async () => {
    await expect(pruneExpiredX402RateLimitBuckets({ batchSize: 10_000 })).resolves.toEqual({
      ok: false,
      reason: "invalid_request",
    });
    expect(prisma).not.toHaveBeenCalled();
  });
});
