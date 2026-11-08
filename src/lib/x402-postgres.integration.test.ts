import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db";
import {
  createX402Challenge,
  getX402ChallengeForVerification,
} from "./x402-challenge";
import { consumeX402ChallengeAndRecordPayment } from "./x402-payment-store";
import { X402_ARC_TESTNET } from "./x402-verifier";
import { consumeArcQuoteSession, registerArcQuoteSession } from "./arc-quote-session-store";

const enabled = process.env.X402_POSTGRES_INTEGRATION === "1";
const prisma = enabled ? getPrisma() : null;
const challengeIds: string[] = [];
const paymentHashes: string[] = [];
const quoteSessionAccounts: string[] = [];

const recipient = "0x1111111111111111111111111111111111111111";
const previousRecipient = process.env.AGFUSION_X402_RECIPIENT;
const payer = "0x2222222222222222222222222222222222222222";

async function issueChallenge() {
  const result = await createX402Challenge();
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
  beforeAll(() => {
    process.env.AGFUSION_X402_RECIPIENT = recipient;
  });

  afterEach(async () => {
    if (!prisma) return;
    if (paymentHashes.length) {
      await prisma.x402Payment.deleteMany({ where: { txHash: { in: paymentHashes } } });
      paymentHashes.length = 0;
    }
    if (quoteSessionAccounts.length) {
      await prisma.arcQuoteSession.deleteMany({ where: { account: { in: quoteSessionAccounts } } });
      quoteSessionAccounts.length = 0;
    }
    if (challengeIds.length) {
      await prisma.x402Challenge.deleteMany({ where: { id: { in: challengeIds } } });
      challengeIds.length = 0;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousRecipient === undefined) delete process.env.AGFUSION_X402_RECIPIENT;
    else process.env.AGFUSION_X402_RECIPIENT = previousRecipient;
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

  it("atomically permits exactly one concurrent claim for an Arc quote session", async () => {
    const account = `0x${randomUUID().replaceAll("-", "").padEnd(40, "0")}`;
    const token = `arc-quote-session-${randomUUID()}-opaque-test-token`;
    quoteSessionAccounts.push(account);
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    const registered = await registerArcQuoteSession({
      token,
      account,
      chainId: 5042,
      expiresAt,
    });
    expect(registered).toEqual({ ok: true });

    const input = { token, account, chainId: 5042 };
    const results = await Promise.all([
      consumeArcQuoteSession(input),
      consumeArcQuoteSession(input),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const stored = await prisma!.arcQuoteSession.findFirst({
      where: { account },
      select: { consumedAt: true, chainId: true, expiresAt: true },
    });
    expect(stored?.chainId).toBe(5042);
    expect(stored?.consumedAt).toBeInstanceOf(Date);
    expect(stored?.expiresAt.getTime()).toBe(expiresAt * 1000);
  });

  it("rejects an expired Arc quote session without consuming it", async () => {
    const account = `0x${randomUUID().replaceAll("-", "").padEnd(40, "0")}`;
    const token = `arc-expired-quote-session-${randomUUID()}-opaque-token`;
    quoteSessionAccounts.push(account);
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    await registerArcQuoteSession({ token, account, chainId: 5042, expiresAt });

    const result = await consumeArcQuoteSession({
      token,
      account,
      chainId: 5042,
      now: new Date((expiresAt + 1) * 1000),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_or_consumed_session" });
    const stored = await prisma!.arcQuoteSession.findFirst({
      where: { account },
      select: { consumedAt: true },
    });
    expect(stored?.consumedAt).toBeNull();
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
