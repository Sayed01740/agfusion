"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { executeSwap } from "@/lib/client-actions";
import { getArcDexSwapQuote, normalizeSlippageBps } from "@/blockchain/production-swap";

type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];
const SLIPPAGE_PRESETS = ["0.5", "1", "1.5", "2", "3"];

function prettyAmount(value?: string) {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function parseSlippageBps(value: string): number {
  return normalizeSlippageBps(Number(value) * 100);
}

function minimumReceived(amountOut: string, slippage: string): string {
  const out = Number(amountOut);
  const pct = Number(slippage);
  if (!Number.isFinite(out) || !Number.isFinite(pct)) return "—";
  return (out * (1 - pct / 100)).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export function ProductionSwapPanel() {
  const { addTransaction, setActiveTx, setThinking, walletAddress } = usePilotStore();
  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amount, setAmount] = useState("0.50");
  const [slippage, setSlippage] = useState("1");
  const [quote, setQuote] = useState<{ amountOut?: string; route?: string } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slippageBps = useMemo(() => {
    try {
      return parseSlippageBps(slippage);
    } catch {
      return null;
    }
  }, [slippage]);

  const canQuote = useMemo(() => {
    const n = Number(amount);
    return !!walletAddress && tokenIn !== tokenOut && Number.isFinite(n) && n > 0 && slippageBps !== null;
  }, [amount, tokenIn, tokenOut, walletAddress, slippageBps]);

  function updateSlippage(value: string) {
    setSlippage(value);
    setError(null);
  }

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setError(null);
  }

  async function getQuote() {
    if (!walletAddress) {
      setError("Connect your wallet before requesting a swap quote.");
      return;
    }
    if (tokenIn === tokenOut) {
      setError("Choose two different tokens.");
      return;
    }
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (slippageBps === null) {
      setError("Slippage must be between 0.1% and 5%.");
      return;
    }

    setQuoteBusy(true);
    setError(null);
    try {
      const raw = await getArcDexSwapQuote({ amount, tokenIn, tokenOut });
      setQuote({ amountOut: raw.amountOut, route: raw.route });
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Unable to obtain a live Arc swap quote.");
    } finally {
      setQuoteBusy(false);
    }
  }

  async function swap() {
    if (!quote) {
      await getQuote();
      return;
    }
    if (!walletAddress) {
      setError("Connect your wallet before swapping.");
      return;
    }
    if (slippageBps === null) {
      setError("Slippage must be between 0.1% and 5%.");
      return;
    }

    setSwapBusy(true);
    setThinking(true);
    setError(null);
    try {
      const tx = await executeSwap({ amount, tokenIn, tokenOut, chain: "Arc_Testnet", slippageBps });
      addTransaction(tx);
      setActiveTx(tx.id);
      if (tx.status !== "success") setError(tx.message || "Swap was submitted but is not confirmed yet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Swap failed.");
    } finally {
      setSwapBusy(false);
      setThinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Arc Testnet Swap</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400">Live Arc DEX quote, wallet confirmation, and receipt verification.</p>
        </div>
        <Badge variant="cyan" className="shrink-0">USDC · EURC · cirBTC</Badge>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">From</span>
            <select value={tokenIn} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenIn(e.target.value as ArcSwapToken); setQuote(null); setError(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" className="mb-0.5 h-10 w-10 shrink-0 px-0 rounded-xl" disabled={quoteBusy || swapBusy} onClick={flip} aria-label="Reverse swap"><ArrowDownUp className="h-4 w-4" /></Button>
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">To</span>
            <select value={tokenOut} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenOut(e.target.value as ArcSwapToken); setQuote(null); setError(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Amount</span>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} disabled={quoteBusy || swapBusy} onChange={(e) => { setAmount(e.target.value); setQuote(null); setError(null); }} placeholder="0.50" />
        </label>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Slippage tolerance</span>
              <span className="mt-1 block text-[11px] text-slate-400">Maximum price movement you are willing to accept.</span>
            </div>
            <div className="flex items-center gap-1.5">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button key={preset} type="button" disabled={quoteBusy || swapBusy} onClick={() => updateSlippage(preset)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${slippage === preset ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"}`}>
                  {preset}%
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Input type="number" min="0.1" max="5" step="0.1" inputMode="decimal" value={slippage} disabled={quoteBusy || swapBusy} onChange={(e) => updateSlippage(e.target.value)} className="h-9 w-24 text-center" aria-label="Custom slippage percentage" />
            <span className="text-[11px] text-slate-500">%</span>
            <span className="ml-auto text-[10px] text-slate-500">Allowed: 0.1%–5%</span>
          </div>
        </div>
      </div>

      {quote && (
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">Estimated receive</span><span className="text-sm font-semibold text-slate-50">{prettyAmount(quote.amountOut)} {tokenOut}</span></div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2.5"><p className="text-slate-500">Minimum receive</p><p className="mt-0.5 text-slate-200">{minimumReceived(quote.amountOut || "", slippage)} {tokenOut}</p></div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2.5"><p className="text-slate-500">Route</p><p className="mt-0.5 text-slate-200">{quote.route || "Arc DEX"}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Your wallet controls the transaction.</span><span className="font-semibold text-cyan-300">{slippage}% slippage</span></div>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-red-200 whitespace-pre-wrap">{error}</div>}

      {!quote && <Button className="w-full" disabled={!canQuote || quoteBusy || swapBusy} onClick={() => void getQuote()}>{quoteBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting live quote…</> : "Get live quote"}</Button>}

      {quote && <div className="space-y-2"><Button className="w-full" disabled={swapBusy || !walletAddress} onClick={() => void swap()}>{swapBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Waiting for wallet…</> : `Continue · Confirm swap (${slippage}%)`}</Button><Button type="button" variant="outline" className="w-full" disabled={swapBusy} onClick={() => void getQuote()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh quote</Button></div>}

      <div className="flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 text-[10px] leading-relaxed text-slate-500"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400/80" />Slippage is applied to the on-chain minimum output. A lower value gives tighter price protection but can cause more failed swaps when liquidity moves quickly.</div>
    </div>
  );
}
