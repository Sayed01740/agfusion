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
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${"00".repeat(32)}`,
      `0x${"0".repeat(24)}${recipient.slice(2)}`,
    ],
    data: `0x${units.toString(16)}`,
  };
}

function mintAndWithdrawLog(
  recipient: string,
  mintToken: string,
  amountUsdc: string,
  address = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
) {
  const units = BigInt(Math.round(Number(amountUsdc) * 1_000_000)).toString(16).padStart(64, "0");
  const word = (value: string) => `0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`;
  return {
    address,
    topics: [
      "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63",
      word(recipient),
      word(mintToken),
    ],
    data: `0x${units}${"0".repeat(64)}`,
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

  it("keeps forwarded CCTP bridges retryable without canonical destination settlement proof", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("no canonical USDC settlement event");
  });

  it("accepts a forwarded CCTP bridge only when destination USDC settlement is proven", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [transferLog("5")] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("success");
    expect(result.retryable).toBe(false);
    expect(result.steps.some((step) => step.name === "USDC Transfer event")).toBe(true);
  });

  it("rejects a partial forwarded USDC Transfer instead of accepting a fee-sized amount", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [transferLog("4.5")] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("no canonical USDC settlement event");
  });

  it("accepts a CCTP MintAndWithdraw event only when topic[1] is the recipient", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [mintAndWithdrawLog(RECIPIENT, USDC, "5")] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("success");
    expect(result.steps.some((step) => step.name === "CCTP MintAndWithdraw event")).toBe(true);
  });

  it("rejects a partial CCTP MintAndWithdraw amount", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [mintAndWithdrawLog(RECIPIENT, USDC, "4.5")] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("no canonical USDC settlement event");
  });

  it("rejects a CCTP event where only the mint-token topic matches the recipient", async () => {
    mockedVerify.mockResolvedValue({
      status: "success",
      receipt: { logs: [mintAndWithdrawLog("0x2222222222222222222222222222222222222222", RECIPIENT, "5")] },
    });

    const record = {
      ...baseBridgeRecord(),
      bridgeResult: { forwardTxHash: TX },
    };
    const result = await finalizeVerifiedTransaction(record, "Arc_Testnet");

    expect(result.status).toBe("retryable");
    expect(result.message).toContain("no canonical USDC settlement event");
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

  it("preserves swap transactions intact without cross-chain destination checks", async () => {
    const swapRecord = {
      id: "tx_swap",
      type: "swap" as const,
      status: "success" as const,
      amount: "0.50",
      token: "USDC",
      tokenOut: "EURC",
      fromChain: "Arc_Testnet" as const,
      toChain: "Arc_Testnet" as const,
      steps: [],
      txHash: TX,
      createdAt: new Date().toISOString(),
      message: "Swap confirmed via ApexiSwap DEX (Testnet): 0.50 USDC → approximately 0.372098 EURC. Receipt verified on-chain.",
      executionMode: "live" as const,
    };

    const result = await finalizeVerifiedTransaction(swapRecord, "Arc_Testnet");

    expect(result.status).toBe("success");
    expect(result.message).toBe("Swap confirmed via ApexiSwap DEX (Testnet): 0.50 USDC → approximately 0.372098 EURC. Receipt verified on-chain.");
    expect(mockedVerify).not.toHaveBeenCalled();
  });
});
