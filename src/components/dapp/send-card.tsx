"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AmountField,
  StepList,
  ResultBanner,
  ErrorNote,
  useArcBalance,
} from "@/components/dapp/shared";
import { TOKEN_LIST, ARC_TOKENS, isAddress, type ArcToken } from "@/lib/dapp/tokens";
import { sendArcToken } from "@/lib/dapp/send";
import { usePilotStore } from "@/store/pilot-store";
import type { TransactionRecord, TxStep } from "@/types";

export function SendCard({ connected }: { connected: boolean }) {
  const addTransaction = usePilotStore((s) => s.addTransaction);
  const refreshBalances = usePilotStore((s) => s.refreshBalances);

  const [token, setToken] = useState<ArcToken>(ARC_TOKENS.USDC);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionRecord | null>(null);

  const bal = useArcBalance(token);
  const recipientValid = recipient.trim() === "" || isAddress(recipient);

  async function onSend() {
    setBusy(true);
    setError(null);
    setResult(null);
    setSteps([]);
    try {
      const tx = await sendArcToken({
        token,
        recipient,
        amount,
        onStep: setSteps,
      });
      addTransaction(tx);
      setResult(tx);
      if (tx.status === "success") {
        setAmount("");
        setRecipient("");
      }
      refreshBalances();
      void bal.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy || !connected || !amount || Number(amount) <= 0 || !isAddress(recipient);

  return (
    <div className="space-y-2.5">
      <AmountField
        label="You send"
        amount={amount}
        onAmountChange={setAmount}
        token={token}
        tokenOptions={TOKEN_LIST}
        onTokenChange={setToken}
        balance={connected ? bal.balance : undefined}
        onMax={connected ? () => setAmount(bal.balance) : undefined}
      />

      <div>
        <label className="mb-1.5 block px-1 text-[12px] text-slate-500">Recipient address</label>
        <Input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x…"
          className="font-mono text-[13px]"
          spellCheck={false}
        />
        {!recipientValid && (
          <p className="mt-1 px-1 text-[11px] text-red-300">Not a valid 0x address.</p>
        )}
      </div>

      {busy && steps.length > 0 && <StepList steps={steps} />}
      {error && <ErrorNote message={error} />}
      {result && <ResultBanner record={result} />}

      <Button size="lg" className="mt-1 w-full" disabled={disabled} onClick={onSend}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : !connected ? (
          "Connect wallet to send"
        ) : !amount ? (
          "Enter an amount"
        ) : !isAddress(recipient) ? (
          "Enter recipient address"
        ) : (
          `Send ${amount} ${token.symbol}`
        )}
      </Button>
    </div>
  );
}
