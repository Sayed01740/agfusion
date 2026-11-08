import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
  decodeEventLog: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      getTransaction: rpc.getTransaction,
      getTransactionReceipt: rpc.getTransactionReceipt,
    }),
    decodeEventLog: rpc.decodeEventLog,
  };
});

import { verifyArcMainnetSwapReceipt } from "@/blockchain/uniswap-receipt-verification";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x8702463e73f74d0b6765aBceb314Ef07aCb92650";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const HASH = ("0x" + "11".repeat(32)) as `0x${string}`;
const params = {
  hash: HASH,
  account: ACCOUNT,
  tokenIn: USDC,
  tokenOut: EURC,
  amountIn: 1_000_000n,
  minimumAmountOut: 891_000n,
};

function setup() {
  rpc.getTransaction.mockResolvedValue({
    chainId: 5042,
    from: ACCOUNT,
    to: ROUTER,
  });
  rpc.getTransactionReceipt.mockResolvedValue({
    transactionHash: HASH,
    blockNumber: 123n,
    status: "success",
    logs: [
      { address: USDC, data: "0xinput", topics: [] },
      { address: EURC, data: "0xoutput", topics: [] },
    ],
  });
  rpc.decodeEventLog.mockImplementation(({ data }: { data: string }) => {
    if (data === "0xinput") return {
      eventName: "Transfer",
      args: { from: ACCOUNT, to: ROUTER, value: 1_000_000n },
    };
    return {
      eventName: "Transfer",
      args: { from: "0x2222222222222222222222222222222222222222", to: ACCOUNT, value: 900_000n },
    };
  });
}

afterEach(() => vi.clearAllMocks());

describe("Arc Mainnet swap receipt verification", () => {
  it("verifies exact input and minimum output from ERC-20 Transfer logs", async () => {
    setup();
    const result = await verifyArcMainnetSwapReceipt(params);
    expect(result).toMatchObject({
      verified: true,
      chainId: 5042,
      transactionHash: HASH,
      blockNumber: 123n,
      inputSpent: 1_000_000n,
      outputReceived: 900_000n,
    });
  });

  it("rejects a transaction from a different wallet", async () => {
    setup();
    rpc.getTransaction.mockResolvedValue({ chainId: 5042, from: "0x2222222222222222222222222222222222222222", to: ROUTER });
    await expect(verifyArcMainnetSwapReceipt(params)).rejects.toThrow(/sender does not match/);
  });

  it("rejects a reverted transaction", async () => {
    setup();
    rpc.getTransactionReceipt.mockResolvedValue({
      transactionHash: HASH,
      blockNumber: 123n,
      status: "reverted",
      logs: [],
    });
    await expect(verifyArcMainnetSwapReceipt(params)).rejects.toThrow(/transaction reverted/);
  });

  it("rejects an input transfer that differs from the exact quote", async () => {
    setup();
    rpc.decodeEventLog.mockImplementation(({ data }: { data: string }) => ({
      eventName: "Transfer",
      args: {
        from: ACCOUNT,
        to: data === "0xinput" ? ROUTER : ACCOUNT,
        value: data === "0xinput" ? 999_999n : 900_000n,
      },
    }));
    await expect(verifyArcMainnetSwapReceipt(params)).rejects.toThrow(/exact quote amount/);
  });

  it("rejects output below the quoted minimum", async () => {
    setup();
    rpc.decodeEventLog.mockImplementation(({ data }: { data: string }) => ({
      eventName: "Transfer",
      args: {
        from: data === "0xinput" ? ACCOUNT : "0x2222222222222222222222222222222222222222",
        to: data === "0xinput" ? ROUTER : ACCOUNT,
        value: data === "0xinput" ? 1_000_000n : 890_999n,
      },
    }));
    await expect(verifyArcMainnetSwapReceipt(params)).rejects.toThrow(/below the quoted minimum/);
  });
});
