import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/x402-challenge", () => ({
  getX402ChallengeForVerification: vi.fn(),
}));
vi.mock("@/lib/x402-verifier", () => ({
  X402_ARC_TESTNET: {
    chainId: 5042002,
    token: "0x3600000000000000000000000000000000000000",
    amount: "1000",
  },
  verifyArcTestnetUsdcPayment: vi.fn(),
}));
vi.mock("@/lib/x402-payment-store", () => ({
  consumeX402ChallengeAndRecordPayment: vi.fn(),
}));

import { getX402ChallengeForVerification } from "@/lib/x402-challenge";
import { verifyArcTestnetUsdcPayment } from "@/lib/x402-verifier";
import { consumeX402ChallengeAndRecordPayment } from "@/lib/x402-payment-store";
import { settleX402Payment } from "./x402-payment-service";

const challenge = {
  id: "challenge-1",
  nonce: "nonce-1",
  serviceId: "agfusion-agent-feed:v1" as const,
  chainId: 5042002,
  token: "0x3600000000000000000000000000000000000000",
  recipient: "0x2222222222222222222222222222222222222222",
  amount: "1000",
};
const txHash = `0x${"ab".repeat(32)}`;
const payer = "0x1111111111111111111111111111111111111111";

const loadChallenge = vi.mocked(getX402ChallengeForVerification);
const verifyPayment = vi.mocked(verifyArcTestnetUsdcPayment);
const consumePayment = vi.mocked(consumeX402ChallengeAndRecordPayment);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("settleX402Payment", () => {
  it("loads the stored challenge, verifies the receipt, then atomically consumes it", async () => {
    loadChallenge.mockResolvedValue({ ok: true, challenge });
    verifyPayment.mockResolvedValue({
      ok: true,
      txHash,
      payer,
      recipient: challenge.recipient,
      amount: "1000",
      blockNumber: "16",
      chainId: 5042002,
    });
    consumePayment.mockResolvedValue({ ok: true, id: "payment-1" });

    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: true, paymentId: "payment-1", txHash });

    expect(loadChallenge).toHaveBeenCalledWith({
      id: challenge.id,
      nonce: challenge.nonce,
    });
    expect(verifyPayment).toHaveBeenCalledWith({
      txHash,
      recipient: challenge.recipient,
    });
    expect(consumePayment).toHaveBeenCalledWith({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      payment: {
        txHash,
        payer,
        recipient: challenge.recipient,
        token: challenge.token,
        amount: "1000",
        chainId: 5042002,
        blockNumber: "16",
      },
    });
  });

  it("rejects malformed client input before touching dependencies", async () => {
    await expect(
      settleX402Payment({ challengeId: "x", nonce: "n", txHash: "not-a-hash" }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(loadChallenge).not.toHaveBeenCalled();
    expect(verifyPayment).not.toHaveBeenCalled();
    expect(consumePayment).not.toHaveBeenCalled();
  });

  it("does not verify a payment when the challenge is invalid or unavailable", async () => {
    loadChallenge.mockResolvedValue({ ok: false, reason: "challenge_invalid" });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "challenge_invalid" });
    expect(verifyPayment).not.toHaveBeenCalled();
    expect(consumePayment).not.toHaveBeenCalled();

    loadChallenge.mockResolvedValue({ ok: false, reason: "database_unavailable" });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(verifyPayment).not.toHaveBeenCalled();
  });

  it("does not consume a challenge when the on-chain payment is invalid", async () => {
    loadChallenge.mockResolvedValue({ ok: true, challenge });
    verifyPayment.mockResolvedValue({ ok: false, reason: "payment_not_found" });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "payment_invalid" });
    expect(consumePayment).not.toHaveBeenCalled();
  });

  it("rejects a verifier result that does not match the stored challenge tuple", async () => {
    loadChallenge.mockResolvedValue({ ok: true, challenge });
    verifyPayment.mockResolvedValue({
      ok: true,
      txHash,
      payer,
      recipient: payer,
      amount: "1000",
      blockNumber: "16",
      chainId: 5042002,
    });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "payment_invalid" });
    expect(consumePayment).not.toHaveBeenCalled();
  });

  it("propagates replay and database failures without granting access", async () => {
    loadChallenge.mockResolvedValue({ ok: true, challenge });
    verifyPayment.mockResolvedValue({
      ok: true,
      txHash,
      payer,
      recipient: challenge.recipient,
      amount: "1000",
      blockNumber: "16",
      chainId: 5042002,
    });

    consumePayment.mockResolvedValue({ ok: false, reason: "already_used" });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "already_used" });

    consumePayment.mockResolvedValue({ ok: false, reason: "database_unavailable" });
    await expect(
      settleX402Payment({ challengeId: challenge.id, nonce: challenge.nonce, txHash }),
    ).resolves.toEqual({ ok: false, reason: "database_unavailable" });
  });
});
