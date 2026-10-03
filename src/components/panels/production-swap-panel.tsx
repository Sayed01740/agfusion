"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { executeSwap } from "@/lib/client-actions";
import { getArcDexSwapQuote, normalizeSlippageBps } from "@/blockchain/production-swap";
import { ARC_NETWORK_NAME, getArcNetworkMeta } from "@/lib/arc-chain";

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
  const { addTransaction, setActiveTx, setThinking, walletAddress, walletChainId } = usePilotStore();
  const meta = getArcNetworkMeta(walletChainId);
  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amount, setAmount] = useState("0.50");
  const [slippage, setSlippage] = useState("1");
  const [quote, setQuote] = useState<{ amountOut?: string; route?: string } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      const activeChain = meta.isMainnet ? "Arc_Mainnet" : "Arc_Testnet";
      const raw = await getArcDexSwapQuote({ amount, tokenIn, tokenOut, chain: activeChain });
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
    setNotice(null);
    try {
      const activeChain = meta.isMainnet ? "Arc_Mainnet" : "Arc_Testnet";
      const tx = await executeSwap({ amount, tokenIn, tokenOut, chain: activeChain, slippageBps });
      addTransaction(tx);
      setActiveTx(tx.id);
      if (tx.status === "success") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap confirmed on-chain!");
      } else if (tx.status === "retryable") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap submitted to Arc — finality is confirming in the background.");
      } else {
        setError(tx.message || "Swap failed.");
      }
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
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">{meta.name} Swap</p>
        <Badge variant="cyan" className="shrink-0">{meta.isMainnet ? "StableFX RFQ" : "USDC · EURC"}</Badge>
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
            </div>
            <div className="flex items-center gap-1.5">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button key={preset} type="button" disabled={quoteBusy || swapBusy} onClick={() => updateSlippage(preset)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${slippage === preset ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"}`}>
                  {preset}%
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input type="number" min="0.1" max="5" step="0.1" inputMode="decimal" value={slippage} disabled={quoteBusy || swapBusy} onChange={(e) => updateSlippage(e.target.value)} className="h-8 w-20 text-center text-xs" aria-label="Custom slippage percentage" />
            <span className="text-[11px] text-slate-500">%</span>
            <span className="ml-auto text-[10px] text-slate-500">Range: 0.1%–5%</span>
          </div>
        </div>
      </div>

      {quote && (
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">Estimated receive</span><span className="text-sm font-semibold text-slate-50">{prettyAmount(quote.amountOut)} {tokenOut}</span></div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Minimum receive</p><p className="mt-0.5 text-slate-200 font-medium">{minimumReceived(quote.amountOut || "", slippage)} {tokenOut}</p></div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Route</p><p className="mt-0.5 text-slate-200 font-medium">{quote.route || "Arc DEX"}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Verified on-chain</span>
            <span className="font-semibold text-cyan-300">{slippage}% slippage</span>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-cyan-200">
          {notice}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-red-200 whitespace-pre-wrap">{error}</div>}

      {!quote && <Button className="w-full font-semibold" disabled={!canQuote || quoteBusy || swapBusy} onClick={() => void getQuote()}>{quoteBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting quote…</> : "Get Quote"}</Button>}

      {quote && (
        <div className="space-y-2">
          <Button className="w-full font-semibold" disabled={swapBusy || !walletAddress} onClick={() => void swap()}>
            {swapBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming in wallet…</> : "Confirm Swap"}
          </Button>
          <Button type="button" variant="outline" className="w-full text-xs h-9" disabled={swapBusy} onClick={() => void getQuote()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh Quote
          </Button>
        </div>
      )}
    </div>
  );
}
