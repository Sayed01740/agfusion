import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(),
}));

import { getPrisma, isDbConfigured } from "@/lib/db";
import { recordX402Payment, type X402PaymentRecord } from "./x402-payment-store";

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
