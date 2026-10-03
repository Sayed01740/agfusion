import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  checkSingleTransactionFinality,
  resolveChainKey,
  pollPendingTransactionsOnce,
} from "./tx-watcher";
import { usePilotStore } from "@/store/pilot-store";
import type { TransactionRecord } from "@/types";

const VALID_TX_1 = "0x" + "11".repeat(32);
const VALID_TX_2 = "0x" + "22".repeat(32);

describe("tx-watcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePilotStore.setState({
      transactions: [],
      walletAddress: "0x1111111111111111111111111111111111111111",
    });
  });

  describe("resolveChainKey", () => {
    it("resolves Base correctly", () => {
      expect(resolveChainKey("Base_Sepolia")).toBe("base");
      expect(resolveChainKey("Base")).toBe("base");
    });

    it("resolves Arc correctly", () => {
      expect(resolveChainKey("Arc_Testnet")).toBe("arc_testnet");
      expect(resolveChainKey("Arc")).toBe("arc_mainnet");
    });
  });

  describe("checkSingleTransactionFinality", () => {
    it("ignores completed non-retryable transactions", async () => {
      const tx: TransactionRecord = {
        id: "tx_done",
        type: "send",
        status: "success",
        retryable: false,
        amount: "10",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        txHash: VALID_TX_1,
        createdAt: new Date().toISOString(),
        steps: [],
      };
      const res = await checkSingleTransactionFinality(tx);
      expect(res.updated).toBe(false);
    });

    it("ignores demo execution transactions", async () => {
      const tx: TransactionRecord = {
        id: "tx_demo",
        type: "send",
        status: "retryable",
        retryable: true,
        amount: "10",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        executionMode: "demo",
        txHash: VALID_TX_1,
        createdAt: new Date().toISOString(),
        steps: [],
      };
      const res = await checkSingleTransactionFinality(tx);
      expect(res.updated).toBe(false);
    });

    it("updates retryable send transaction to success when receipt status is 0x1", async () => {
      // Mock global fetch to return receipt status 0x1
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { status: "0x1", blockNumber: "0x10" },
          }),
        } as unknown as Response;
      });

      const tx: TransactionRecord = {
        id: "tx_send_pending",
        type: "send",
        status: "retryable",
        retryable: true,
        amount: "25",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        txHash: VALID_TX_1,
        createdAt: new Date().toISOString(),
        steps: [
          { name: "Preparation", state: "success" },
          { name: "Submission", state: "success", txHash: VALID_TX_1 },
          { name: "Finality", state: "pending", message: "Submitted — finality is still pending." },
        ],
      };

      const res = await checkSingleTransactionFinality(tx);
      expect(res.updated).toBe(true);
      expect(res.status).toBe("success");
      expect(res.patch?.status).toBe("success");
      expect(res.patch?.retryable).toBe(false);
      expect(res.patch?.steps?.[2].state).toBe("success");
    });

    it("updates retryable transaction to error when receipt status is 0x0", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { status: "0x0", blockNumber: "0x10" },
          }),
        } as unknown as Response;
      });

      const tx: TransactionRecord = {
        id: "tx_reverted",
        type: "swap",
        status: "retryable",
        retryable: true,
        amount: "50",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        txHash: VALID_TX_1,
        createdAt: new Date().toISOString(),
        steps: [{ name: "Swap execution", state: "pending" }],
      };

      const res = await checkSingleTransactionFinality(tx);
      expect(res.updated).toBe(true);
      expect(res.status).toBe("error");
      expect(res.patch?.status).toBe("error");
      expect(res.patch?.retryable).toBe(false);
      expect(res.patch?.steps?.[0].state).toBe("error");
    });

    it("verifies bridge destination mint when forwardTxHash is already known", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { status: "0x1", blockNumber: "0x10" },
          }),
        } as unknown as Response;
      });

      const tx: TransactionRecord = {
        id: "tx_bridge_forwarded",
        type: "bridge",
        status: "retryable",
        retryable: true,
        amount: "100",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Base_Sepolia",
        txHash: VALID_TX_1,
        bridgeResult: {
          burnTxHash: VALID_TX_1,
          forwardTxHash: VALID_TX_2,
        },
        createdAt: new Date().toISOString(),
        steps: [
          { name: "Source Burn", state: "success", txHash: VALID_TX_1 },
          { name: "Destination Mint", state: "pending" },
        ],
      };

      const res = await checkSingleTransactionFinality(tx);
      expect(res.updated).toBe(true);
      expect(res.status).toBe("success");
      expect(res.patch?.status).toBe("success");
      expect(res.patch?.retryable).toBe(false);
      expect(res.patch?.txHash).toBe(VALID_TX_2);
    });
  });

  describe("pollPendingTransactionsOnce", () => {
    it("updates store and triggers refreshBalances when candidates confirm", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { status: "0x1", blockNumber: "0x10" },
          }),
        } as unknown as Response;
      });

      const tx: TransactionRecord = {
        id: "tx_poll_test",
        type: "send",
        status: "retryable",
        retryable: true,
        amount: "15",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        txHash: VALID_TX_1,
        createdAt: new Date().toISOString(),
        steps: [],
      };

      usePilotStore.setState({
        transactions: [tx],
      });

      const updatedCount = await pollPendingTransactionsOnce();
      expect(updatedCount).toBe(1);

      const storeAfter = usePilotStore.getState();
      const updatedTx = storeAfter.transactions.find((t) => t.id === "tx_poll_test");
      expect(updatedTx?.status).toBe("success");
      expect(updatedTx?.retryable).toBe(false);
    });
  });
});
