import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db";
import {
  createX402Challenge,
  getX402ChallengeForVerification,
} from "./x402-challenge";
import { consumeX402ChallengeAndRecordPayment } from "./x402-payment-store";
import { X402_ARC_TESTNET } from "./x402-verifier";

const enabled = process.env.X402_POSTGRES_INTEGRATION === "1";
const prisma = enabled ? getPrisma() : null;
const challengeIds: string[] = [];
const paymentHashes: string[] = [];

const recipient = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";

async function issueChallenge() {
  const result = await createX402Challenge({ recipient });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Challenge creation failed: ${result.reason}`);
  challengeIds.push(result.challenge.id);
  return result.challenge;
}

function payment(txHash: string) {
  return {
    txHash,
    payer,
    recipient,
    token: X402_ARC_TESTNET.token,
    amount: X402_ARC_TESTNET.amount,
    chainId: X402_ARC_TESTNET.chainId,
    blockNumber: "123",
  };
}

describe.skipIf(!enabled)("x402 disposable PostgreSQL integration", () => {
  afterEach(async () => {
    if (!prisma) return;
    if (paymentHashes.length) {
      await prisma.x402Payment.deleteMany({ where: { txHash: { in: paymentHashes } } });
      paymentHashes.length = 0;
    }
    if (challengeIds.length) {
      await prisma.x402Challenge.deleteMany({ where: { id: { in: challengeIds } } });
      challengeIds.length = 0;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("persists a challenge and retrieves its authoritative payment tuple", async () => {
    const issued = await issueChallenge();
    const loaded = await getX402ChallengeForVerification({
      id: issued.id,
      nonce: issued.nonce,
    });

    expect(loaded).toEqual({
      ok: true,
      challenge: {
        id: issued.id,
        nonce: issued.nonce,
        serviceId: issued.serviceId,
        chainId: X402_ARC_TESTNET.chainId,
        token: X402_ARC_TESTNET.token,
        recipient,
        amount: X402_ARC_TESTNET.amount,
      },
    });
  });

  it("atomically consumes one challenge and stores its payment once under concurrent requests", async () => {
    const issued = await issueChallenge();
    const txHash = `0x${randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
    paymentHashes.push(txHash);

    const input = {
      challengeId: issued.id,
      nonce: issued.nonce,
      payment: payment(txHash),
    };

    const results = await Promise.all([
      consumeX402ChallengeAndRecordPayment(input),
      consumeX402ChallengeAndRecordPayment(input),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(await prisma!.x402Payment.count({ where: { txHash } })).toBe(1);
    const storedChallenge = await prisma!.x402Challenge.findUnique({
      where: { id: issued.id },
      select: { consumedAt: true },
    });
    expect(storedChallenge?.consumedAt).toBeInstanceOf(Date);
  });

  it("rolls challenge consumption back when a transaction hash was already used", async () => {
    const first = await issueChallenge();
    const second = await issueChallenge();
    const txHash = `0x${randomUUID().replaceAll("-", "").padEnd(64, "1")}`;
    paymentHashes.push(txHash);

    const firstResult = await consumeX402ChallengeAndRecordPayment({
      challengeId: first.id,
      nonce: first.nonce,
      payment: payment(txHash),
    });
    expect(firstResult.ok).toBe(true);

    const duplicateResult = await consumeX402ChallengeAndRecordPayment({
      challengeId: second.id,
      nonce: second.nonce,
      payment: payment(txHash),
    });
    expect(duplicateResult).toEqual({ ok: false, reason: "already_used" });

    const secondStored = await prisma!.x402Challenge.findUnique({
      where: { id: second.id },
      select: { consumedAt: true },
    });
    expect(secondStored?.consumedAt).toBeNull();
    expect(await prisma!.x402Payment.count({ where: { txHash } })).toBe(1);
  });

  it("does not consume an expired challenge or create a payment", async () => {
    const issued = await issueChallenge();
    const txHash = `0x${randomUUID().replaceAll("-", "").padEnd(64, "2")}`;
    paymentHashes.push(txHash);

    const result = await consumeX402ChallengeAndRecordPayment({
      challengeId: issued.id,
      nonce: issued.nonce,
      payment: payment(txHash),
      now: new Date(Date.now() + 10 * 60 * 1000),
    });

    expect(result).toEqual({ ok: false, reason: "challenge_invalid" });
    expect(await prisma!.x402Payment.count({ where: { txHash } })).toBe(0);
    const storedChallenge = await prisma!.x402Challenge.findUnique({
      where: { id: issued.id },
      select: { consumedAt: true },
    });
    expect(storedChallenge?.consumedAt).toBeNull();
  });
});
