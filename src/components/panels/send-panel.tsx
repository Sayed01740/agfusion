"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { TokenMark } from "@/components/brand/token-mark";
import { Field } from "@/components/panels/field";
import { usePilotStore } from "@/store/pilot-store";
import { getArcNetworkMeta } from "@/lib/arc-chain";
import { executeSend } from "@/lib/client-actions";
import { quoteSendFee } from "@/lib/fees";
import type { ChainId } from "@/types";

export function SendPanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode, walletChainId, networkMode } =
    usePilotStore();
  const effectiveChainId =
    walletChainId === 5042 || walletChainId === 5042002
      ? walletChainId
      : networkMode === "mainnet"
        ? 5042
        : 5042002;
  const meta = getArcNetworkMeta(effectiveChainId);
  const [amount, setAmount] = useState("0.05");
  const [to, setTo] = useState("");
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
    const trimmed = to.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError("Paste a full 0x address (42 characters). Names are not resolved on-chain.");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    setConfirm(false);
    try {
      const activeChain: ChainId = meta.isMainnet ? "Arc_Mainnet" : "Arc_Testnet";
      const transaction = await executeSend({
        amount,
        token: "USDC",
        chain: activeChain,
        recipient: trimmed,
        preferLive: true,
      });
      addTransaction(transaction);
      setActiveTx(transaction.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Send failed — check wallet / funds",
      );
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Field label="Amount (USDC)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <TokenMark token="USDC" size={18} />
            </span>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="pl-10 pr-14"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-muted-foreground">
              USDC
            </span>
          </div>
        </Field>
        <Field label="Recipient Address">
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={busy}
            placeholder="0x…"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </Field>
        <FeeLineItems quote={quoteSendFee(amount)} compact />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button
          className="w-full font-semibold"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Sending…" : "Send USDC"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Confirm payment"
        summary={`Send ${amount} USDC to ${to} on Arc. Live mode opens your wallet.`}
        feeQuote={quoteSendFee(amount)}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}
