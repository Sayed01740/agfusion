import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(),
}));

import { getPrisma, isDbConfigured } from "@/lib/db";
import { consumeX402ChallengeAndRecordPayment, recordX402Payment, type X402PaymentRecord } from "./x402-payment-store";

const payment: X402PaymentRecord = {
  txHash: `0x${"AB".repeat(32)}`,
  payer: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  recipient: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  token: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  amount: "1000",
  chainId: 5042002,
  blockNumber: "16",
};

const configured = vi.mocked(isDbConfigured);
const prisma = vi.mocked(getPrisma);

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordX402Payment", () => {
  it("refuses authorization when PostgreSQL is not configured", async () => {
    configured.mockReturnValue(false);

    await expect(recordX402Payment(payment)).resolves.toEqual({
      ok: false,
      reason: "database_unavailable",
    });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("stores normalized payment identifiers using one atomic create", async () => {
    configured.mockReturnValue(true);
    const create = vi.fn().mockResolvedValue({ id: "payment-row-1" });
    prisma.mockReturnValue({ x402Payment: { create } } as never);

    await expect(recordX402Payment(payment)).resolves.toEqual({
      ok: true,
      id: "payment-row-1",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        txHash: payment.txHash.toLowerCase(),
        payer: payment.payer.toLowerCase(),
        recipient: payment.recipient.toLowerCase(),
        token: payment.token.toLowerCase(),
        amount: "1000",
        chainId: 5042002,
        blockNumber: "16",
      },
      select: { id: true },
    });
  });

  it("rejects a transaction hash already protected by the unique constraint", async () => {
    configured.mockReturnValue(true);
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    prisma.mockReturnValue({ x402Payment: { create } } as never);

    await expect(recordX402Payment(payment)).resolves.toEqual({
      ok: false,
      reason: "already_used",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("fails closed for database errors other than duplicate hashes", async () => {
    configured.mockReturnValue(true);
    const create = vi.fn().mockRejectedValue(new Error("database offline"));
    prisma.mockReturnValue({ x402Payment: { create } } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(recordX402Payment(payment)).resolves.toEqual({
      ok: false,
      reason: "database_unavailable",
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});


describe("consumeX402ChallengeAndRecordPayment", () => {
  const input = {
    challengeId: "challenge-1",
    nonce: "nonce-1",
    payment,
    now: new Date("2026-10-31T18:00:00.000Z"),
  };

  it("consumes the matching unexpired challenge and records payment in one transaction", async () => {
    configured.mockReturnValue(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: "payment-atomic-1" });
    const tx = { x402Challenge: { updateMany }, x402Payment: { create } };
    const transaction = vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
    prisma.mockReturnValue({ $transaction: transaction } as never);

    await expect(consumeX402ChallengeAndRecordPayment(input)).resolves.toEqual({
      ok: true,
      id: "payment-atomic-1",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "challenge-1",
        nonce: "nonce-1",
        serviceId: "agfusion-agent-feed:v1",
        chainId: 5042002,
        token: payment.token.toLowerCase(),
        recipient: payment.recipient.toLowerCase(),
        amount: "1000",
        expiresAt: { gt: input.now },
        consumedAt: null,
      },
      data: { consumedAt: input.now },
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects an expired, mismatched, or already consumed challenge without recording payment", async () => {
    configured.mockReturnValue(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn();
    const tx = { x402Challenge: { updateMany }, x402Payment: { create } };
    prisma.mockReturnValue({
      $transaction: vi.fn(async (callback) => callback(tx as never)),
    } as never);

    await expect(consumeX402ChallengeAndRecordPayment(input)).resolves.toEqual({
      ok: false,
      reason: "challenge_invalid",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a transaction hash already used by another challenge", async () => {
    configured.mockReturnValue(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const tx = { x402Challenge: { updateMany }, x402Payment: { create } };
    const transaction = vi.fn(async (callback) => callback(tx as never));
    prisma.mockReturnValue({ $transaction: transaction } as never);

    await expect(consumeX402ChallengeAndRecordPayment(input)).resolves.toEqual({
      ok: false,
      reason: "already_used",
    });
  });

  it("fails closed when the atomic database transaction is unavailable", async () => {
    configured.mockReturnValue(true);
    prisma.mockReturnValue({
      $transaction: vi.fn().mockRejectedValue(new Error("database offline")),
    } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(consumeX402ChallengeAndRecordPayment(input)).resolves.toEqual({
      ok: false,
      reason: "database_unavailable",
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
