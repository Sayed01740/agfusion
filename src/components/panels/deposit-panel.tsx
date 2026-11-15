"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { ChainMark } from "@/components/brand/chain-mark";
import { Field } from "@/components/panels/field";
import { usePilotStore } from "@/store/pilot-store";
import { CHAIN_LIST } from "@/lib/chains";
import { executeUnifiedDeposit } from "@/lib/client-actions";
import { quoteBridgeFee } from "@/lib/fees";
import type { ChainId } from "@/types";

export function UnifiedBalancePanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode } =
    usePilotStore();
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState<ChainId>("Base_Sepolia");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const mode = executionMode();

  async function run() {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    setConfirm(false);
    try {
      const transaction = await executeUnifiedDeposit({
        amount,
        fromChain: from,
      });
      addTransaction(transaction);
      setActiveTx(transaction.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Deposit failed — check source USDC and wallet network",
      );
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Field label="Deposit Amount (USDC)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="From network">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <ChainMark chain={from} compact size={18} />
            </span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground min-w-0 focus:border-accent focus:outline-none"
              value={from}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value as ChainId)}
            >
              {CHAIN_LIST.filter((c) => c.id !== "Solana_Devnet").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Deposit USDC from <strong className="text-slate-300">{from.replace(/_/g, " ")}</strong> into your Unified Balance.
          This abstracts away the underlying chain so it can be spent on Arc.
        </p>

        <FeeLineItems quote={quoteBridgeFee(amount)} compact />
        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap leading-relaxed">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Processing…" : "Continue · Confirm deposit"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Confirm deposit"
        summary={`Deposit ${amount} USDC from ${from.replace(/_/g, " ")} to your Unified Balance.`}
        feeQuote={quoteBridgeFee(amount)}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}
