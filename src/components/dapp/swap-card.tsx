"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AmountField, ResultBanner, ErrorNote, useArcBalance } from "@/components/dapp/shared";
import { ARC_TOKENS, SWAP_SYMBOLS, type ArcToken } from "@/lib/dapp/tokens";
import { getArcDexSwapQuote } from "@/blockchain/production-swap";
import { executeSwap } from "@/lib/client-actions";
import { usePilotStore } from "@/store/pilot-store";
import type { TransactionRecord } from "@/types";

const SWAP_TOKENS: ArcToken[] = SWAP_SYMBOLS.map((s) => ARC_TOKENS[s]);
const SLIPPAGE_PRESETS = [50, 100, 300];

export function SwapCard({ connected }: { connected: boolean }) {
  const addTransaction = usePilotStore((s) => s.addTransaction);
  const refreshBalances = usePilotStore((s) => s.refreshBalances);

  const [tokenIn, setTokenIn] = useState<ArcToken>(ARC_TOKENS.USDC);
  const [tokenOut, setTokenOut] = useState<ArcToken>(ARC_TOKENS.EURC);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [route, setRoute] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [slippageBps, setSlippageBps] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionRecord | null>(null);

  const inBal = useArcBalance(tokenIn);
  const quoteSeq = useRef(0);

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut && amountOut !== "0" ? "" : amountIn);
    setAmountOut("");
  }

  function pickIn(t: ArcToken) {
    if (t.symbol === tokenOut.symbol) setTokenOut(tokenIn);
    setTokenIn(t);
  }
  function pickOut(t: ArcToken) {
    if (t.symbol === tokenIn.symbol) setTokenIn(tokenOut);
    setTokenOut(t);
  }

  // Debounced live quote (requires a connected wallet).
  useEffect(() => {
    setResult(null);
    const n = Number(amountIn);
    if (!connected || !amountIn || !Number.isFinite(n) || n <= 0 || tokenIn.symbol === tokenOut.symbol) {
      setAmountOut("");
      setRoute(null);
      setError(null);
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const q = await getArcDexSwapQuote({
          amount: amountIn,
          tokenIn: tokenIn.symbol,
          tokenOut: tokenOut.symbol,
        });
        if (seq !== quoteSeq.current) return;
        setAmountOut(q.amountOut);
        setRoute(q.route);
        setError(null);
      } catch (e) {
        if (seq !== quoteSeq.current) return;
        setAmountOut("");
        setRoute(null);
        setError(e instanceof Error ? e.message : "No quote available.");
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [amountIn, tokenIn, tokenOut, connected]);

  async function onSwap() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const tx = await executeSwap({
        amount: amountIn,
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        chain: "Arc_Testnet",
        slippageBps,
      });
      addTransaction(tx);
      setResult(tx);
      if (tx.status === "success") {
        setAmountIn("");
        setAmountOut("");
      }
      refreshBalances();
      void inBal.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Swap failed.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !connected || !amountIn || Number(amountIn) <= 0 || tokenIn.symbol === tokenOut.symbol || !amountOut;
  const minReceived =
    amountOut && Number(amountOut) > 0
      ? (Number(amountOut) * (1 - slippageBps / 10_000)).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : null;

  return (
    <div className="space-y-1.5">
      <AmountField
        label="You pay"
        amount={amountIn}
        onAmountChange={setAmountIn}
        token={tokenIn}
        tokenOptions={SWAP_TOKENS}
        onTokenChange={pickIn}
        balance={connected ? inBal.balance : undefined}
        onMax={connected ? () => setAmountIn(inBal.balance) : undefined}
      />

      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={flip}
          className="absolute -top-3.5 z-10 grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-[#0c1219] text-slate-300 transition-colors hover:border-white/25 hover:text-white"
          aria-label="Switch direction"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>

      <AmountField
        label="You receive"
        amount={amountOut}
        token={tokenOut}
        tokenOptions={SWAP_TOKENS}
        onTokenChange={pickOut}
        readOnly
        loading={quoting}
        secondary={route ? `Route: ${route}` : undefined}
      />

      <div className="flex items-center justify-between px-1 pt-2 text-[12px] text-slate-500">
        <span>Max slippage</span>
        <div className="flex items-center gap-1">
          {SLIPPAGE_PRESETS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                slippageBps === bps ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {(bps / 100).toString()}%
            </button>
          ))}
        </div>
      </div>
      {minReceived && (
        <div className="flex items-center justify-between px-1 text-[12px] text-slate-500">
          <span>Minimum received</span>
          <span className="text-slate-300">
            {minReceived} {tokenOut.symbol}
          </span>
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {result && <ResultBanner record={result} />}

      <Button size="lg" className="mt-1 w-full" disabled={disabled} onClick={onSwap}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Swapping…
          </>
        ) : !connected ? (
          "Connect wallet to swap"
        ) : tokenIn.symbol === tokenOut.symbol ? (
          "Select different tokens"
        ) : !amountIn ? (
          "Enter an amount"
        ) : !amountOut && !quoting ? (
          "No route available"
        ) : (
          `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`
        )}
      </Button>
    </div>
  );
}
