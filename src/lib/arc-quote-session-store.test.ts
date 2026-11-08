import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), isDbConfigured: vi.fn() }));
import { getPrisma, isDbConfigured } from "@/lib/db";
import { consumeArcQuoteSession, registerArcQuoteSession } from "./arc-quote-session-store";

const dbConfigured = vi.mocked(isDbConfigured);
const prisma = vi.mocked(getPrisma);
const token = "opaque-session-token-that-is-long-enough-for-storage";
const account = "0x1111111111111111111111111111111111111111";
const now = new Date("2026-11-08T12:00:00.000Z");

afterEach(() => vi.clearAllMocks());

describe("durable Arc quote-session replay guard", () => {
  it("fails closed if the Preview PostgreSQL database is not configured", async () => {
    dbConfigured.mockReturnValue(false);
    await expect(registerArcQuoteSession({
      token, account, chainId: 5042, expiresAt: Math.floor(now.getTime() / 1000) + 60,
    })).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("stores only the token digest and normalized account binding", async () => {
    dbConfigured.mockReturnValue(true);
    const create = vi.fn().mockResolvedValue({ id: "row-1" });
    prisma.mockReturnValue({ arcQuoteSession: { create } } as never);
    const expiresAt = Math.floor(now.getTime() / 1000) + 60;
    await expect(registerArcQuoteSession({ token, account: account.toUpperCase().replace("0X", "0x"), chainId: 5042, expiresAt }))
      .resolves.toEqual({ ok: true });
    const data = create.mock.calls[0][0].data;
    expect(data.tokenHash).not.toBe(token);
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.account).toBe(account);
    expect(data.chainId).toBe(5042);
    expect(data.expiresAt).toEqual(new Date(expiresAt * 1000));
  });

  it("atomically consumes one eligible session using a conditional update", async () => {
    dbConfigured.mockReturnValue(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    prisma.mockReturnValue({ arcQuoteSession: { updateMany } } as never);
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042, now })).resolves.toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        account, chainId: 5042, consumedAt: null,
        expiresAt: { gt: now },
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      data: { consumedAt: now },
    }));
  });

  it("rejects a replay or a concurrent loser when no row can be claimed", async () => {
    dbConfigured.mockReturnValue(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    prisma.mockReturnValue({ arcQuoteSession: { updateMany } } as never);
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042, now }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
  });

  it("fails closed when the database write fails", async () => {
    dbConfigured.mockReturnValue(true);
    const updateMany = vi.fn().mockRejectedValue(new Error("database offline"));
    prisma.mockReturnValue({ arcQuoteSession: { updateMany } } as never);
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042, now }))
      .resolves.toEqual({ ok: false, reason: "database_unavailable" });
  });

  it("rejects wrong chain or malformed wallet before attempting a database write", async () => {
    dbConfigured.mockReturnValue(true);
    await expect(consumeArcQuoteSession({ token, account, chainId: 1, now }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
    await expect(consumeArcQuoteSession({ token, account: "bad", chainId: 5042, now }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
    expect(prisma).not.toHaveBeenCalled();
  });
});
