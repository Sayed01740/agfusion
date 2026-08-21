import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeVerifiedTransaction } from "./financial-receipt";
import { verifyReceiptOnChain } from "./tx-verify";

vi.mock("./tx-verify", () => ({
  verifyReceiptOnChain: vi.fn(),
}));

const mockedVerify = vi.mocked(verifyReceiptOnChain);
const TX = `0x${"11".repeat(32)}`;
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const USDC = "0x3600000000000000000000000000000000000000";

function transferLog(amountUsdc: string, recipient = RECIPIENT, address = USDC) {
  const units = BigInt(Math.round(Number(amountUsdc) * 1_000_000));
  return {
    address,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a7e7b5d8a4",
      `0x${"00".repeat(32)}`,
      `0x${"0".repeat(24)}${recipient.slice(2)}`,
    ],
    data: `0x${units.toString(16)}`,
  };
}

function baseBridgeRecord() {
  return {
    id: "tx_test",
    type: "bridge" as const,
    status: "success" as const,
    amount: "5",
    token: "USDC",
    fromChain: "Base_Sepolia" as const,
    toChain: "Arc_Testnet" as const,
    steps: [],
    txHash: TX,
    createdAt: new Date().toISOString(),
    executionMode: "live" as const,
    bridgeState: {
      txId: "tx_test",
      walletType: "evm" as const,
      walletAddress: RECIPIENT,
      fromChain: "Base_Sepolia" as const,
      toChain: "Arc_Testnet" as const,
      token: "USDC",
      amount: "5",
      state: "DESTINATION_PENDING" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

describe("finalizeVerifiedTransaction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires receipt success and exact USDC settlement event for bridges", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [transferLog("5")] },
    });

    const result = await finalizeVerifiedTransaction(baseBridgeRecord(), "Arc_Testnet");

    expect(result.status).toBe("success");
    expect(result.retryable).toBe(false);
    expect(result.steps.map((step) => step.name)).toEqual([
      "Settlement receipt",
      "USDC Transfer event",
    ]);
  });

  it("fails closed when the receipt is unavailable", async () => {
    mockedVerify.mockResolvedValue({ status: "not_found", receipt: null });

    const result = await finalizeVerifiedTransaction(baseBridgeRecord(), "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("not confirmed");
  });

  it("rejects an event from the wrong token contract", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [transferLog("5", RECIPIENT, `0x${"22".repeat(20)}`)] },
    });

    const result = await finalizeVerifiedTransaction(baseBridgeRecord(), "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.message).toContain("exact expected USDC Transfer event");
  });

  it("rejects a partial or over-sized settlement event", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [transferLog("5.000001")] },
    });

    const result = await finalizeVerifiedTransaction(baseBridgeRecord(), "Arc_Testnet");

    expect(result.status).toBe("retryable");
  });
});
