"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilot-store";
import { executeBridgeRecovery } from "@/lib/client-actions";
import type { TransactionRecord } from "@/types";

export function RecoveryPanelBody() {
  const { addTransaction, setActiveTx, setThinking, transactions, activeTxId } =
    usePilotStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The failed bridge to recover: the active tx if it's a failed bridge,
  // otherwise the most recent failed/retryable bridge (Phase 11).
  const failedTx: TransactionRecord | null =
    (transactions.find(
      (t) => t.id === activeTxId && t.type === "bridge" && (t.status === "error" || t.status === "retryable"),
    ) as TransactionRecord | undefined) ??
    (transactions.find(
      (t) => t.type === "bridge" && (t.status === "error" || t.status === "retryable"),
    ) as TransactionRecord | undefined) ??
    null;

  async function run() {
    if (!failedTx?.fromChain || !failedTx.toChain) {
      setError("No failed bridge to recover.");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    try {
      // Recover the EXACT failed transaction — never a hardcoded bridge.
      const tx = await executeBridgeRecovery({
        amount: failedTx.amount || "0",
        fromChain: failedTx.fromChain,
        toChain: failedTx.toChain,
        token: failedTx.token || "USDC",
        recipient: failedTx.recipient,
        failedTx,
        txId: failedTx.id,
      });
      addTransaction(tx);
      setActiveTx(tx.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  if (!failedTx?.fromChain || !failedTx.toChain) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Resume the failed bridge{" "}
        <strong className="text-slate-300">
          {failedTx.amount} USDC {failedTx.fromChain.replace(/_/g, " ")} →{" "}
          {failedTx.toChain.replace(/_/g, " ")}
        </strong>
        . AGFusion resumes from the last confirmed step and will not burn again.
      </p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={busy}
        type="button"
        onClick={() => void run()}
      >
        {busy ? "Recovering…" : `Resume ${failedTx.amount} USDC bridge`}
      </Button>
    </div>
  );
}
