import { describe, expect, it } from "vitest";
import { verifyArcTestnetUsdcPayment, X402_ARC_TESTNET } from "./x402-verifier";

const TX = `0x${"ab".repeat(32)}`;
const BLOCK_HASH = `0x${"cd".repeat(32)}`;
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const pad = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;

function rpcMock(
  chainId = "0x4cef52",
  receipt: unknown = null,
  canonicalBlock: unknown = { hash: BLOCK_HASH, number: "0x10" },
): typeof fetch {
  let call = 0;
  return (async () => {
    call += 1;
    const result = call === 1 ? chainId : call === 2 ? receipt : canonicalBlock;
    return {
      ok: true,
      status: 200,
      json: async () => ({ result }),
    } as Response;
  }) as typeof fetch;
}

function validReceipt(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: TX,
    status: "0x1",
    blockNumber: "0x10",
    blockHash: BLOCK_HASH,
    logs: [{
      address: X402_ARC_TESTNET.token,
      topics: [X402_ARC_TESTNET.transferTopic, pad(PAYER), pad(RECIPIENT)],
      data: `0x${BigInt(X402_ARC_TESTNET.amount).toString(16).padStart(64, "0")}`,
    }],
    ...overrides,
  };
}

describe("verifyArcTestnetUsdcPayment", () => {
  it("accepts only the exact Arc Testnet USDC transfer in the canonical receipt block", async () => {
    const result = await verifyArcTestnetUsdcPayment({
      txHash: TX,
      recipient: RECIPIENT,
      fetchImpl: rpcMock("0x4cef52", validReceipt()),
    });
    expect(result).toEqual({
      ok: true,
      txHash: TX,
      payer: PAYER,
      recipient: RECIPIENT,
      amount: "1000",
      blockNumber: "16",
      chainId: 5042002,
    });
  });

  it("rejects malformed transaction hashes and recipients", async () => {
    const result = await verifyArcTestnetUsdcPayment({
      txHash: "0x_fake",
      recipient: RECIPIENT,
      fetchImpl: rpcMock(),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_hash" });
  });

  it("rejects a non-Testnet chain id", async () => {
    const result = await verifyArcTestnetUsdcPayment({
      txHash: TX,
      recipient: RECIPIENT,
      fetchImpl: rpcMock("0x13b2", validReceipt()),
    });
    expect(result).toEqual({ ok: false, reason: "wrong_chain" });
  });

  it("rejects missing and reverted receipts", async () => {
    const missing = await verifyArcTestnetUsdcPayment({
      txHash: TX, recipient: RECIPIENT, fetchImpl: rpcMock("0x4cef52", null),
    });
    const reverted = await verifyArcTestnetUsdcPayment({
      txHash: TX, recipient: RECIPIENT,
      fetchImpl: rpcMock("0x4cef52", validReceipt({ status: "0x0" })),
    });
    expect(missing).toEqual({ ok: false, reason: "not_mined" });
    expect(reverted).toEqual({ ok: false, reason: "reverted" });
  });

  it("rejects a receipt whose block is no longer canonical", async () => {
    const result = await verifyArcTestnetUsdcPayment({
      txHash: TX,
      recipient: RECIPIENT,
      fetchImpl: rpcMock("0x4cef52", validReceipt(), {
        hash: `0x${"ef".repeat(32)}`,
        number: "0x10",
      }),
    });
    expect(result).toEqual({ ok: false, reason: "block_not_canonical" });
  });

  it("rejects wrong recipient, token, or amount", async () => {
    const wrongRecipient = validReceipt();
    (wrongRecipient.logs as Array<{ topics: string[] }>)[0].topics[2] = pad(PAYER);
    const wrongToken = validReceipt();
    (wrongToken.logs as Array<{ address: string }>)[0].address = "0x3333333333333333333333333333333333333333";
    const wrongAmount = validReceipt();
    (wrongAmount.logs as Array<{ data: string }>)[0].data = `0x${"0".repeat(63)}1`;

    for (const receipt of [wrongRecipient, wrongToken, wrongAmount]) {
      const result = await verifyArcTestnetUsdcPayment({
        txHash: TX, recipient: RECIPIENT, fetchImpl: rpcMock("0x4cef52", receipt),
      });
      expect(result).toEqual({ ok: false, reason: "payment_not_found" });
    }
  });

  it("rejects removed logs and malformed Transfer event topics", async () => {
    const removed = validReceipt();
    (removed.logs as unknown as Array<{ removed: boolean }>)[0].removed = true;
    const malformed = validReceipt();
    (malformed.logs as Array<{ topics: string[] }>)[0].topics.pop();

    for (const receipt of [removed, malformed]) {
      const result = await verifyArcTestnetUsdcPayment({
        txHash: TX, recipient: RECIPIENT, fetchImpl: rpcMock("0x4cef52", receipt),
      });
      expect(result).toEqual({ ok: false, reason: "payment_not_found" });
    }
  });

  it("rejects duplicate matching transfers as ambiguous", async () => {
    const receipt = validReceipt();
    (receipt.logs as unknown[]).push((receipt.logs as unknown[])[0]);
    const result = await verifyArcTestnetUsdcPayment({
      txHash: TX, recipient: RECIPIENT, fetchImpl: rpcMock("0x4cef52", receipt),
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous_payment" });
  });

  it("fails closed when the RPC fails", async () => {
    const failingFetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const result = await verifyArcTestnetUsdcPayment({
      txHash: TX,
      recipient: RECIPIENT,
      fetchImpl: failingFetch,
    });
    expect(result).toEqual({ ok: false, reason: "rpc_unavailable" });
  });
});
