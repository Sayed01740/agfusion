"use client";

import { useEffect } from "react";
import { usePilotStore } from "@/store/pilot-store";
import { isValidTxHash, verifyReceiptOnChain } from "@/lib/tx-verify";
import { getCctpConfig } from "@/lib/cctp-chains";
import { explorerTxUrl, IS_ARC_MAINNET } from "@/lib/arc-chain";
import type { TransactionRecord, TxStep } from "@/types";

export interface FinalityCheckResult {
  updated: boolean;
  status?: "success" | "error";
  patch?: Partial<TransactionRecord>;
}

export function resolveChainKey(chainName?: string): string {
  if (!chainName) return IS_ARC_MAINNET ? "arc_mainnet" : "arc";
  const config = getCctpConfig(chainName);
  if (config?.rpcProxyKey) return config.rpcProxyKey;
  const lower = chainName.toLowerCase();
  if (lower.includes("base")) return "base";
  if (lower.includes("mainnet")) return "arc_mainnet";
  if (lower.includes("testnet") || lower.includes("arc")) return "arc";
  if (lower.includes("eth")) return "eth";
  if (lower.includes("arb")) return "arb";
  if (lower.includes("op")) return "op";
  if (lower.includes("polygon")) return "polygon";
  return IS_ARC_MAINNET ? "arc_mainnet" : "arc";
}

function markAllStepsSuccess(steps: TxStep[] = [], successTxHash?: string, note?: string): TxStep[] {
  if (!steps.length) {
    return [
      {
        name: "Settlement",
        state: "success",
        txHash: successTxHash,
        message: note || "Confirmed on-chain.",
      },
    ];
  }
  return steps.map((s) => {
    if (s.state === "pending" || s.state === "active") {
      return {
        ...s,
        state: "success" as const,
        txHash: s.txHash || successTxHash,
        message: note || s.message || "Confirmed on-chain.",
      };
    }
    return s;
  });
}

function markActiveStepsError(steps: TxStep[] = [], errorMessage: string): TxStep[] {
  if (!steps.length) {
    return [
      {
        name: "Settlement",
        state: "error",
        message: errorMessage,
      },
    ];
  }
  return steps.map((s) => {
    if (s.state === "pending" || s.state === "active") {
      return {
        ...s,
        state: "error" as const,
        message: errorMessage,
      };
    }
    return s;
  });
}

/** Check a single transaction on-chain / via Iris and return finality update if confirmed. */
export async function checkSingleTransactionFinality(
  tx: TransactionRecord,
): Promise<FinalityCheckResult> {
  // If transaction is already terminal success/error (and not retryable), no check needed
  if (tx.status !== "retryable" && tx.status !== "pending" && !tx.retryable) {
    return { updated: false };
  }

  // Demo transactions are local simulations, not on-chain
  if (tx.executionMode === "demo") {
    return { updated: false };
  }

  // Cross-chain bridge verification
  if (tx.type === "bridge") {
    const bridgeRes = (tx.bridgeResult as Record<string, any>) || {};
    const forwardTxHash = bridgeRes.forwardTxHash;
    const burnTx = bridgeRes.burnTxHash || tx.txHash;

    // Case 1: Forwarded destination mint tx hash is known
    if (forwardTxHash && isValidTxHash(forwardTxHash)) {
      const destChain = tx.toChain;
      const chainKey = resolveChainKey(destChain);
      const verified = await verifyReceiptOnChain({
        chainKey,
        txHash: forwardTxHash,
        attempts: 1,
      });

      if (verified.status === "success") {
        const destExplorer = explorerTxUrl(forwardTxHash, destChain);
        return {
          updated: true,
          status: "success",
          patch: {
            status: "success",
            retryable: false,
            txHash: forwardTxHash,
            explorerUrl: destExplorer,
            message: `Bridged ${tx.amount} USDC ${tx.fromChain} → ${tx.toChain}. Destination mint confirmed.`,
            steps: markAllStepsSuccess(tx.steps, forwardTxHash, "Destination mint confirmed on-chain."),
            bridgeResult: { ...bridgeRes, settlementPending: false },
          },
        };
      } else if (verified.status === "reverted") {
        return {
          updated: true,
          status: "error",
          patch: {
            status: "error",
            retryable: false,
            message: "Destination mint transaction reverted on-chain.",
            steps: markActiveStepsError(tx.steps, "Destination mint transaction reverted on-chain."),
            bridgeResult: { ...bridgeRes, settlementPending: false },
          },
        };
      }
      return { updated: false };
    }

    // Case 2: Only burnTx is known, poll Circle Iris for forwardTxHash
    if (burnTx && isValidTxHash(burnTx)) {
      try {
        const sourceConfig = tx.fromChain ? getCctpConfig(tx.fromChain) : null;
        if (sourceConfig?.domain !== undefined) {
          const irisUrl = `/api/circle/iris?path=${encodeURIComponent(
            `/v2/messages/${sourceConfig.domain}?transactionHash=${encodeURIComponent(burnTx)}`,
          )}`;
          const res = await fetch(irisUrl, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const messages = Array.isArray(data?.messages) ? data.messages : [];
            const msg =
              messages.find(
                (c: any) =>
                  String(c?.transactionHash || "").toLowerCase() === burnTx.toLowerCase(),
              ) || messages[0];

            if (msg?.forwardTxHash && isValidTxHash(msg.forwardTxHash)) {
              const mintTx = String(msg.forwardTxHash);
              const destConfig = tx.toChain ? getCctpConfig(tx.toChain) : null;
              const destChainKey = destConfig?.rpcProxyKey || resolveChainKey(tx.toChain);
              const verified = await verifyReceiptOnChain({
                chainKey: destChainKey,
                txHash: mintTx,
                attempts: 1,
              });

              if (verified.status === "success") {
                const destExplorer = explorerTxUrl(mintTx, tx.toChain);
                return {
                  updated: true,
                  status: "success",
                  patch: {
                    status: "success",
                    retryable: false,
                    txHash: mintTx,
                    explorerUrl: destExplorer,
                    message: `Bridged ${tx.amount} USDC ${tx.fromChain} → ${tx.toChain}. Destination mint confirmed.`,
                    bridgeResult: {
                      ...bridgeRes,
                      burnTxHash: burnTx,
                      forwardTxHash: mintTx,
                      settlementPending: false,
                    },
                    steps: [
                      ...(tx.steps || []),
                      {
                        name: "Destination Mint via Circle Forwarding Service",
                        state: "success" as const,
                        txHash: mintTx,
                        message: "Circle Forwarding Service confirmed destination mint.",
                      },
                    ],
                  },
                };
              }
            }
          }
        }
      } catch {
        // Iris or network transient error
      }
    }
    return { updated: false };
  }

  // Standard EVM transactions: send, swap, disperse, unified_spend, etc.
  if (!tx.txHash || !isValidTxHash(tx.txHash)) {
    return { updated: false };
  }

  const targetChain = tx.fromChain || tx.toChain;
  const chainKey = resolveChainKey(targetChain);

  const verified = await verifyReceiptOnChain({
    chainKey,
    txHash: tx.txHash,
    attempts: 1,
  });

  if (verified.status === "success") {
    const rawMsg = tx.message || "";
    let cleanMsg = rawMsg
      .replace(/ · [^·]*not confirmed[^·]*/gi, "")
      .replace(/Submitted — finality is still pending.*$/i, "Confirmed on-chain.")
      .trim();

    if (!cleanMsg || cleanMsg === "Transaction") {
      cleanMsg = "Confirmed on-chain.";
    } else if (!cleanMsg.includes("Confirmed")) {
      cleanMsg = `${cleanMsg} · Confirmed on-chain.`;
    }

    return {
      updated: true,
      status: "success",
      patch: {
        status: "success",
        retryable: false,
        message: cleanMsg,
        steps: markAllStepsSuccess(tx.steps, tx.txHash, "Confirmed on-chain."),
      },
    };
  }

  if (verified.status === "reverted") {
    return {
      updated: true,
      status: "error",
      patch: {
        status: "error",
        retryable: false,
        message: "Transaction reverted on-chain.",
        steps: markActiveStepsError(tx.steps, "Transaction reverted on-chain."),
      },
    };
  }

  return { updated: false };
}

/** Set of active in-flight tx IDs currently being checked */
const activeChecks = new Set<string>();

/**
 * Poll all pending/retryable transactions once.
 * Returns the number of transactions that were updated to success or error.
 */
export async function pollPendingTransactionsOnce(): Promise<number> {
  const store = usePilotStore.getState();
  const txs = store.transactions;

  const candidates = txs.filter(
    (t) =>
      (t.status === "retryable" || t.status === "pending" || t.retryable) &&
      t.executionMode !== "demo" &&
      (Boolean(t.txHash) || Boolean((t.bridgeResult as any)?.burnTxHash)),
  );

  if (candidates.length === 0) return 0;

  let updateCount = 0;

  for (const tx of candidates) {
    if (activeChecks.has(tx.id)) continue;
    activeChecks.add(tx.id);

    try {
      const result = await checkSingleTransactionFinality(tx);
      if (result.updated && result.patch) {
        usePilotStore.getState().updateTransaction(tx.id, result.patch);
        updateCount++;
      }
    } catch (err) {
      console.warn(`[tx-watcher] error verifying tx ${tx.id}:`, err);
    } finally {
      activeChecks.delete(tx.id);
    }
  }

  if (updateCount > 0) {
    usePilotStore.getState().refreshBalances();
  }

  return updateCount;
}

/** React hook that runs background watching for pending/retryable transactions */
export function useTransactionWatcher(options: { intervalMs?: number } = {}) {
  const intervalMs = options.intervalMs ?? 5_000;
  const transactions = usePilotStore((s) => s.transactions);

  const hasPending = transactions.some(
    (t) =>
      (t.status === "retryable" || t.status === "pending" || t.retryable) &&
      t.executionMode !== "demo" &&
      (Boolean(t.txHash) || Boolean((t.bridgeResult as any)?.burnTxHash)),
  );

  useEffect(() => {
    if (!hasPending) return;

    // Immediate check upon pending transaction appearance
    void pollPendingTransactionsOnce();

    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pollPendingTransactionsOnce();
    }, intervalMs);

    function onVisibilityOrFocus() {
      if (typeof document !== "undefined" && !document.hidden) {
        void pollPendingTransactionsOnce();
      }
    }

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [hasPending, intervalMs]);
}

export function TransactionWatcher() {
  useTransactionWatcher();
  return null;
}
