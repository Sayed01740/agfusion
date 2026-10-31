import { describe, expect, it, vi } from "vitest";
import { verifyArcTestnetUsdcPayment, X402_ARC_TESTNET } from "@/lib/x402-verifier";
import { settleX402Payment } from "./x402-payment-service";

const TX = `0x${"ab".repeat(32)}`;
const BLOCK_HASH = `0x${"cd".repeat(32)}`;
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const pad = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;

const challenge = {
  id: "persisted-challenge",
  nonce: "persisted-nonce",
  serviceId: "agfusion-agent-feed:v1" as const,
  chainId: 5042002,
  token: X402_ARC_TESTNET.token,
  recipient: RECIPIENT,
  amount: X402_ARC_TESTNET.amount,
};

function arcRpcFetch(overrides: {
  chainId?: string;
  recipient?: string;
  token?: string;
  amount?: bigint;
} = {}): typeof fetch {
  const receipt = {
    transactionHash: TX,
    status: "0x1",
    blockNumber: "0x10",
    blockHash: BLOCK_HASH,
    logs: [{
      address: overrides.token ?? X402_ARC_TESTNET.token,
      topics: [
        X402_ARC_TESTNET.transferTopic,
        pad(PAYER),
        pad(overrides.recipient ?? RECIPIENT),
      ],
      data: `0x${(overrides.amount ?? BigInt(X402_ARC_TESTNET.amount)).toString(16).padStart(64, "0")}`,
    }],
  };

  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    const result =
      request.method === "eth_chainId"
        ? overrides.chainId ?? "0x4cef52"
        : request.method === "eth_getTransactionReceipt"
          ? receipt
          : { hash: BLOCK_HASH, number: "0x10" };

    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result }),
    } as Response;
  }) as typeof fetch;
}

describe("x402 settlement with the production Arc receipt verifier and mocked RPC", () => {
  it("verifies the real RPC response shape before consuming and recording the challenge", async () => {
    const loadChallenge = vi.fn().mockResolvedValue({ ok: true, challenge });
    const consumePayment = vi.fn().mockResolvedValue({ ok: true, id: "payment-row" });

    const result = await settleX402Payment(
      { challengeId: challenge.id, nonce: challenge.nonce, txHash: TX },
      {
        loadChallenge,
        verifyPayment: (input) =>
          verifyArcTestnetUsdcPayment({ ...input, fetchImpl: arcRpcFetch() }),
        consumePayment,
      },
    );

    expect(result).toEqual({ ok: true, paymentId: "payment-row", txHash: TX });
    expect(loadChallenge).toHaveBeenCalledOnce();
    expect(consumePayment).toHaveBeenCalledWith({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      payment: {
        txHash: TX,
        payer: PAYER,
        recipient: RECIPIENT,
        token: X402_ARC_TESTNET.token,
        amount: X402_ARC_TESTNET.amount,
        chainId: 5042002,
        blockNumber: "16",
      },
    });
  });

  it.each([
    ["wrong chain", { chainId: "0x13b2" }],
    ["wrong recipient", { recipient: PAYER }],
    ["wrong token", { token: "0x3333333333333333333333333333333333333333" }],
    ["wrong amount", { amount: 1n }],
  ])("does not consume a challenge for %s", async (_label, overrides) => {
    const loadChallenge = vi.fn().mockResolvedValue({ ok: true, challenge });
    const consumePayment = vi.fn();

    const result = await settleX402Payment(
      { challengeId: challenge.id, nonce: challenge.nonce, txHash: TX },
      {
        loadChallenge,
        verifyPayment: (input) =>
          verifyArcTestnetUsdcPayment({
            ...input,
            fetchImpl: arcRpcFetch(overrides),
          }),
        consumePayment,
      },
    );

    expect(result).toEqual({ ok: false, reason: "payment_invalid" });
    expect(consumePayment).not.toHaveBeenCalled();
  });
});
