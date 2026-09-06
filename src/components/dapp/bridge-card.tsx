"use client";

import { useMemo, useState } from "react";
import { Loader2, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountField, ResultBanner, ErrorNote, useArcBalance } from "@/components/dapp/shared";
import { ARC_TOKENS, BRIDGE_ROUTES, isAddress } from "@/lib/dapp/tokens";
import { executeBridge } from "@/lib/client-actions";
import { usePilotStore } from "@/store/pilot-store";
import type { ChainId, TransactionRecord } from "@/types";

export function BridgeCard({ connected }: { connected: boolean }) {
  const addTransaction = usePilotStore((s) => s.addTransaction);
  const refreshBalances = usePilotStore((s) => s.refreshBalances);

  const [routeIdx, setRouteIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionRecord | null>(null);

  const route = BRIDGE_ROUTES[routeIdx];
  const fromArc = route.from === "Arc_Testnet";
  const bal = useArcBalance(fromArc ? ARC_TOKENS.USDC : null);
  const recipientValid = recipient.trim() === "" || isAddress(recipient);

  const [fromLabel, toLabel] = useMemo(() => {
    const parts = route.label.split(" → ");
    return [parts[0], parts[1]];
  }, [route]);

  async function onBridge() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const tx = await executeBridge({
        amount,
        fromChain: route.from as ChainId,
        toChain: route.to as ChainId,
        token: "USDC",
        recipient: recipient.trim() ? recipient.trim() : undefined,
      });
      addTransaction(tx);
      setResult(tx);
      if (tx.status === "success") setAmount("");
      refreshBalances();
      void bal.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bridge failed.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !connected || !amount || Number(amount) <= 0 || !recipientValid;

  return (
    <div className="space-y-2.5">
      <div>
        <label className="mb-1.5 block px-1 text-[12px] text-slate-500">Route</label>
        <div className="grid gap-1.5">
          {BRIDGE_ROUTES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRouteIdx(i)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors ${
                i === routeIdx
                  ? "border-cyan-400/40 bg-cyan-400/10 text-slate-100"
                  : "border-white/[0.06] bg-[#0a1017] text-slate-300 hover:border-white/15"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                {r.label.split(" → ")[0]}
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                {r.label.split(" → ")[1]}
              </span>
              {i === routeIdx && <span className="text-[11px] font-semibold text-cyan-300">Selected</span>}
            </button>
          ))}
        </div>
      </div>

      <AmountField
        label={`Bridge from ${fromLabel}`}
        amount={amount}
        onAmountChange={setAmount}
        token={ARC_TOKENS.USDC}
        tokenOptions={[ARC_TOKENS.USDC]}
        balance={connected && fromArc ? bal.balance : undefined}
        onMax={connected && fromArc ? () => setAmount(bal.balance) : undefined}
        lockToken
      />

      <div>
        <label className="mb-1.5 block px-1 text-[12px] text-slate-500">
          Recipient on {toLabel} <span className="text-slate-600">(optional — defaults to your wallet)</span>
        </label>
        <Input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x… (leave blank to keep same address)"
          className="font-mono text-[13px]"
          spellCheck={false}
        />
        {!recipientValid && <p className="mt-1 px-1 text-[11px] text-red-300">Not a valid 0x address.</p>}
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-[#0a1017] p-3 text-[12px] text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span>
          Cross-chain transfers use Circle CCTP (burn → attest → mint) and can take a few minutes to
          finalize. You can track progress on the dashboard after signing.
        </span>
      </div>

      {error && <ErrorNote message={error} />}
      {result && <ResultBanner record={result} />}

      <Button size="lg" className="mt-1 w-full" disabled={disabled} onClick={onBridge}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Bridging…
          </>
        ) : !connected ? (
          "Connect wallet to bridge"
        ) : !amount ? (
          "Enter an amount"
        ) : (
          `Bridge ${amount} USDC`
        )}
      </Button>
    </div>
  );
}
