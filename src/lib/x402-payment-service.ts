import {
  getX402ChallengeForVerification,
  type X402ChallengeForVerification,
} from "@/lib/x402-challenge";
import {
  X402_ARC_TESTNET,
  verifyArcTestnetUsdcPayment,
  type X402Verification,
} from "@/lib/x402-verifier";
import {
  consumeX402ChallengeAndRecordPayment,
  type X402ConsumeResult,
} from "@/lib/x402-payment-store";

export type X402SettlementResult =
  | { ok: true; paymentId: string; txHash: string }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "challenge_invalid"
        | "database_unavailable"
        | "payment_invalid"
        | "already_used";
    };

type SettlementDependencies = {
  loadChallenge: typeof getX402ChallengeForVerification;
  verifyPayment: typeof verifyArcTestnetUsdcPayment;
  consumePayment: typeof consumeX402ChallengeAndRecordPayment;
};

const defaultDependencies: SettlementDependencies = {
  loadChallenge: getX402ChallengeForVerification,
  verifyPayment: verifyArcTestnetUsdcPayment,
  consumePayment: consumeX402ChallengeAndRecordPayment,
};

/**
 * Server-side x402 settlement orchestration.
 *
 * This deliberately is not called by the HTTP route yet. The route remains
 * disabled until schema rollout, Arc finality policy, and an explicit
 * activation review are complete.
 */
export async function settleX402Payment(
  input: { challengeId: string; nonce: string; txHash: string },
  dependencies: SettlementDependencies = defaultDependencies,
  now?: Date,
): Promise<X402SettlementResult> {
  if (
    typeof input.challengeId !== "string" ||
    input.challengeId.length < 1 ||
    input.challengeId.length > 128 ||
    typeof input.nonce !== "string" ||
    input.nonce.length < 1 ||
    input.nonce.length > 128 ||
    typeof input.txHash !== "string" ||
    !/^0x[a-fA-F0-9]{64}$/.test(input.txHash)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const loaded: X402ChallengeForVerification =
    await dependencies.loadChallenge({
      id: input.challengeId,
      nonce: input.nonce,
      ...(now ? { now } : {}),
    });

  if (!loaded.ok) {
    return {
      ok: false,
      reason:
        loaded.reason === "database_unavailable"
          ? "database_unavailable"
          : "challenge_invalid",
    };
  }

  const challenge = loaded.challenge;
  if (
    challenge.chainId !== X402_ARC_TESTNET.chainId ||
    challenge.token !== X402_ARC_TESTNET.token ||
    challenge.amount !== X402_ARC_TESTNET.amount
  ) {
    return { ok: false, reason: "challenge_invalid" };
  }

  const verified: X402Verification = await dependencies.verifyPayment({
    txHash: input.txHash,
    recipient: challenge.recipient,
  });

  if (!verified.ok) {
    return { ok: false, reason: "payment_invalid" };
  }

  // Re-check the complete verified tuple before passing it to the atomic
  // database consume operation. Never take payment facts from POST input.
  if (
    verified.txHash.toLowerCase() !== input.txHash.toLowerCase() ||
    verified.recipient.toLowerCase() !== challenge.recipient.toLowerCase() ||
    verified.amount !== challenge.amount ||
    verified.chainId !== challenge.chainId
  ) {
    return { ok: false, reason: "payment_invalid" };
  }

  const consumed: X402ConsumeResult =
    await dependencies.consumePayment({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      payment: {
        txHash: verified.txHash,
        payer: verified.payer,
        recipient: verified.recipient,
        token: challenge.token,
        amount: verified.amount,
        chainId: verified.chainId,
        blockNumber: verified.blockNumber,
      },
      ...(now ? { now } : {}),
    });

  if (!consumed.ok) {
    return {
      ok: false,
      reason:
        consumed.reason === "already_used"
          ? "already_used"
          : consumed.reason === "database_unavailable"
            ? "database_unavailable"
            : "challenge_invalid",
    };
  }

  return {
    ok: true,
    paymentId: consumed.id,
    txHash: verified.txHash,
  };
}
