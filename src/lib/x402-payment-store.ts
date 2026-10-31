import { X402_AGENT_SERVICE_ID } from "@/lib/x402-challenge";
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


export type X402ChallengeConsumption = {
  challengeId: string;
  nonce: string;
  payment: X402PaymentRecord;
  now?: Date;
};

export type X402ConsumeResult =
  | { ok: true; id: string }
  | { ok: false; reason: "database_unavailable" | "already_used" | "challenge_invalid" };

/**
 * Consume the exact, unexpired challenge and record the verified payment in
 * one PostgreSQL transaction. Conditional updateMany prevents concurrent
 * replays; the unique txHash constraint independently prevents reuse of a
 * transaction across different challenges.
 */
export async function consumeX402ChallengeAndRecordPayment(
  input: X402ChallengeConsumption,
): Promise<X402ConsumeResult> {
  if (!isDbConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }

  const now = input.now ?? new Date();
  const payment = input.payment;

  try {
    return await getPrisma().$transaction(async (tx) => {
      const consumed = await tx.x402Challenge.updateMany({
        where: {
          id: input.challengeId,
          nonce: input.nonce,
          serviceId: X402_AGENT_SERVICE_ID,
          chainId: payment.chainId,
          token: payment.token.toLowerCase(),
          recipient: payment.recipient.toLowerCase(),
          amount: payment.amount,
          expiresAt: { gt: now },
          consumedAt: null,
        },
        data: { consumedAt: now },
      });

      if (consumed.count !== 1) {
        return { ok: false, reason: "challenge_invalid" } as const;
      }

      const row = await tx.x402Payment.create({
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

      return { ok: true, id: row.id } as const;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: false, reason: "already_used" };
    }
    console.warn("[x402] challenge consumption unavailable; refusing authorization", error);
    return { ok: false, reason: "database_unavailable" };
  }
}
