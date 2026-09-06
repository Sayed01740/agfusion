"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Zap, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TokenSelect,
  StepList,
  ResultBanner,
  ErrorNote,
  useArcBalance,
  formatBalance,
} from "@/components/dapp/shared";
import { TOKEN_LIST, ARC_TOKENS, isAddress, isDisperseConfigured, type ArcToken } from "@/lib/dapp/tokens";
import { runBatchDisperse, validateBatch, type BatchRow } from "@/lib/dapp/disperse";
import { sendArcToken } from "@/lib/dapp/send";
import { usePilotStore } from "@/store/pilot-store";
import type { TransactionRecord, TxStep } from "@/types";

const EMPTY_ROWS: BatchRow[] = [
  { label: "Recipient 1", address: "", amount: "" },
  { label: "Recipient 2", address: "", amount: "" },
];

export function BatchCard({ connected }: { connected: boolean }) {
  const addTransaction = usePilotStore((s) => s.addTransaction);
  const setActiveTx = usePilotStore((s) => s.setActiveTx);
  const refreshBalances = usePilotStore((s) => s.refreshBalances);

  const [token, setToken] = useState<ArcToken>(ARC_TOKENS.USDC);
  const [rows, setRows] = useState<BatchRow[]>(EMPTY_ROWS);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionRecord | null>(null);

  const bal = useArcBalance(token);
  const singleSig = isDisperseConfigured();

  const filled = rows.filter((r) => r.address.trim() || r.amount.trim());
  const total = filled.reduce((sum, r) => {
    const n = Number(r.amount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const allValid =
    filled.length > 0 &&
    filled.every((r) => isAddress(r.address) && Number(r.amount) > 0);

  function updateRow(i: number, patch: Partial<BatchRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { label: `Recipient ${rs.length + 1}`, address: "", amount: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  function reset() {
    setSteps([]);
    setLog([]);
    setError(null);
    setResult(null);
  }

  async function onBatch() {
    reset();
    setBusy(true);
    try {
      // Validate once up front (both paths).
      validateBatch(rows, token);
      if (singleSig) {
        const tx = await runBatchDisperse({ token, rows, onStep: setSteps });
        addTransaction(tx);
        setActiveTx(tx.id);
        setResult(tx);
        if (tx.status === "success") setRows(EMPTY_ROWS);
      } else {
        await runSequential();
      }
      refreshBalances();
      void bal.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runSequential() {
    const targets = rows.filter((r) => r.address.trim() && r.amount.trim());
    setLog([`→ Sending ${targets.length} ${token.symbol} payouts (one confirmation each)…`]);
    let lastTx: TransactionRecord | null = null;
    let ok = 0;
    for (const row of targets) {
      const who = row.label?.trim() || row.address.slice(0, 8);
      setLog((l) => [...l, `→ ${who}: ${row.amount} ${token.symbol} — confirm in wallet…`]);
      try {
        const tx = await sendArcToken({
          token,
          recipient: row.address,
          amount: row.amount,
          recipientLabel: `Batch · ${who}`,
        });
        addTransaction(tx);
        setActiveTx(tx.id);
        lastTx = tx;
        ok += 1;
        setLog((l) => [
          ...l,
          `✓ ${who}: ${tx.status}${tx.txHash ? ` · ${tx.txHash.slice(0, 12)}…` : ""}`,
        ]);
      } catch (e) {
        setLog((l) => [...l, `✗ ${who}: ${e instanceof Error ? e.message : "failed"}`]);
      }
    }
    setLog((l) => [...l, `✓ Done — ${ok}/${targets.length} payouts sent.`]);
    if (lastTx) setResult(lastTx);
  }

  const disabled = busy || !connected || !allValid;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-500">Token</span>
          <TokenSelect value={token} options={TOKEN_LIST} onChange={setToken} />
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            singleSig
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/25 bg-amber-400/10 text-amber-200"
          }`}
          title={
            singleSig
              ? "AGFusionDisperse contract configured — the whole batch is one signature."
              : "Deploy AGFusionDisperse and set NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS for a single-signature batch."
          }
        >
          {singleSig ? <Zap className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
          {singleSig ? "Single signature" : "One confirm each"}
        </span>
      </div>

      {connected && (
        <div className="px-1 text-[12px] text-slate-500">
          Balance: {formatBalance(bal.balance)} {token.symbol}
        </div>
      )}

      <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin pr-0.5">
        {rows.map((row, i) => {
          const addrBad = row.address.trim() !== "" && !isAddress(row.address);
          return (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#0a1017] p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Input
                  value={row.label ?? ""}
                  onChange={(e) => updateRow(i, { label: e.target.value })}
                  placeholder="Label"
                  className="h-9 flex-1 text-[13px]"
                />
                <Input
                  value={row.amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) updateRow(i, { amount: v });
                  }}
                  inputMode="decimal"
                  placeholder="Amount"
                  className="h-9 w-24 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-30"
                  aria-label="Remove recipient"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={row.address}
                onChange={(e) => updateRow(i, { address: e.target.value })}
                placeholder="0x recipient address"
                className={`h-9 font-mono text-[12px] ${addrBad ? "border-red-500/40" : ""}`}
                spellCheck={false}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addRow} disabled={busy}>
          <Plus className="h-3.5 w-3.5" /> Add recipient
        </Button>
        <div className="px-1 text-right">
          <div className="text-[11px] text-slate-500">Total</div>
          <div className="text-sm font-semibold text-slate-100">
            {total.toLocaleString(undefined, { maximumFractionDigits: 6 })} {token.symbol}
          </div>
        </div>
      </div>

      {busy && steps.length > 0 && <StepList steps={steps} />}
      {log.length > 0 && (
        <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#0a1017] p-3 font-mono text-[11px] scrollbar-thin">
          {log.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("✓")
                  ? "text-emerald-400"
                  : line.startsWith("✗")
                    ? "text-red-400"
                    : "text-slate-500"
              }
            >
              {line}
            </div>
          ))}
        </div>
      )}
      {error && <ErrorNote message={error} />}
      {result && <ResultBanner record={result} />}

      <Button size="lg" className="mt-1 w-full" disabled={disabled} onClick={onBatch}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {singleSig ? "Dispersing…" : "Sending batch…"}
          </>
        ) : !connected ? (
          "Connect wallet to batch send"
        ) : !allValid ? (
          "Complete every recipient row"
        ) : singleSig ? (
          `Send to ${filled.length} recipients (1 signature)`
        ) : (
          `Send to ${filled.length} recipients`
        )}
      </Button>
    </div>
  );
}
