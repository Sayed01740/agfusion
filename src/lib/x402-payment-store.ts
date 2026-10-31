import { getPrisma, isDbConfigured } from "@/lib/db";

export type X402PaymentRecord = {
  txHash: string;
  payer: string;
  recipient: string;
  token: string;
  amount: string;
  chainId: number;
  blockNumber: string;
};

export type X402RecordResult =
  | { ok: true; id: string }
  | { ok: false; reason: "database_unavailable" | "already_used" };

/**
 * The database unique constraint on txHash is the replay guard.
 * Never replace this with a read-then-write check, which races under concurrency.
 */
export async function recordX402Payment(
  payment: X402PaymentRecord,
): Promise<X402RecordResult> {
  if (!isDbConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }

  try {
    const row = await getPrisma().x402Payment.create({
      data: {
        txHash: payment.txHash.toLowerCase(),
        payer: payment.payer.toLowerCase(),
        recipient: payment.recipient.toLowerCase(),
        token: payment.token.toLowerCase(),
        amount: payment.amount,
        chainId: payment.chainId,
        blockNumber: payment.blockNumber,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: false, reason: "already_used" };
    }
    console.warn("[x402] payment record unavailable; refusing authorization", error);
    return { ok: false, reason: "database_unavailable" };
  }
}
