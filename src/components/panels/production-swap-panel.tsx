"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { executeSwap } from "@/lib/client-actions";
import { getArcDexSwapQuote, normalizeSlippageBps } from "@/blockchain/production-swap";
import { getArcNetworkMeta } from "@/lib/arc-chain";
import { getInjectedProvider } from "@/sdk/wallet-adapter";

type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];
const SLIPPAGE_PRESETS = ["0.5", "1", "1.5", "2", "3"];
type SwapQuote = {
  amountOut?: string;
  minimumAmountOut?: string;
  route?: string;
  network?: "mainnet" | "testnet";
  quoteSession?: string;
  quoteSessionExpiresAt?: number;
  permitData?: Record<string, unknown> | null;
  estimatedGasUsd?: string | null;
};

type PreparedMainnetTransaction = {
  transaction: {
    chainId: number;
    from: string;
    to: string;
    value: string;
    gasLimit: string;
  };
  validation?: {
    estimatedGas?: string;
    estimatedGasCost?: string;
    minimumAmountOut?: string;
    commandNames?: string[];
  };
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseChainId(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.startsWith("0x")) return Number.parseInt(raw.slice(2), 16);
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return Number.NaN;
}

async function getVerifiedMainnetProvider(expectedAddress: string) {
  const provider = await getInjectedProvider();
  const [rawChainId, rawAccounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  const chainId = parseChainId(rawChainId);
  const account = Array.isArray(rawAccounts) && typeof rawAccounts[0] === "string"
    ? rawAccounts[0]
    : "";
  if (chainId !== 5042) throw new Error("Connect the selected wallet to Arc Mainnet (chain ID 5042).");
  if (!/^0x[0-9a-fA-F]{40}$/.test(account) || account.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("The connected wallet account changed. Reconnect the quoted wallet and request a new quote.");
  }
  return { provider, account };
}

export function ProductionSwapPanel() {
  const { addTransaction, setActiveTx, setThinking, walletAddress, walletChainId } = usePilotStore();
  const meta = getArcNetworkMeta(walletChainId);

  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amount, setAmount] = useState("0.50");
  const [slippage, setSlippage] = useState("1");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [prepared, setPrepared] = useState<PreparedMainnetTransaction | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setQuote(null);
    setPrepared(null);
    setError(null);
    setNotice(null);
  }, [walletAddress, walletChainId]);


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
    setQuote(null);
    setPrepared(null);
    setError(null);
    setNotice(null);
  }

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setPrepared(null);
    setError(null);
    setNotice(null);
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
    setNotice(null);
    setPrepared(null);
    setQuote(null);
    try {
      if (meta.isMainnet) {
        await getVerifiedMainnetProvider(walletAddress);
        const response = await fetch("/api/uniswap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: walletAddress,
            amount,
            tokenIn,
            tokenOut,
            chainId: 5042,
            slippageBps,
          }),
          cache: "no-store",
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecord(data) || data.ok !== true || typeof data.quoteSession !== "string") {
          const message = isRecord(data) && typeof data.detail === "string"
            ? data.detail
            : isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Unable to obtain an Arc Mainnet quote.";
          throw new Error(message);
        }
        setQuote({
          amountOut: String(data.amountOut || ""),
          minimumAmountOut: String(data.minimumAmountOut || ""),
          route: String(data.routing || "Uniswap"),
          network: "mainnet",
          quoteSession: data.quoteSession,
          quoteSessionExpiresAt: typeof data.quoteSessionExpiresAt === "number" ? data.quoteSessionExpiresAt : undefined,
          permitData: isRecord(data.permitData) ? data.permitData : null,
          estimatedGasUsd: typeof data.estimatedGasUsd === "string" ? data.estimatedGasUsd : null,
        });
      } else {
        const raw = await getArcDexSwapQuote({ amount, tokenIn, tokenOut, chain: "Arc_Testnet", slippageBps });
        setQuote({ amountOut: raw.amountOut, minimumAmountOut: raw.minimumAmountOut, route: raw.route, network: "testnet" });
      }
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Unable to obtain a live Arc swap quote.");
    } finally {
      setQuoteBusy(false);
    }
  }

  async function prepareMainnetTransaction() {
    if (!quote?.quoteSession || !walletAddress) throw new Error("Request a fresh Mainnet quote before preparing a transaction.");
    const gateResponse = await fetch("/api/uniswap/swap", { method: "GET", cache: "no-store" });
    const gate: unknown = await gateResponse.json().catch(() => null);
    if (!gateResponse.ok || !isRecord(gate) || gate.enabled !== true || gate.executionEnabled !== false) {
      setNotice("Mainnet transaction preparation is disabled in this deployment. The quote is read-only; no wallet signature or transaction was requested.");
      return;
    }

    const { provider, account } = await getVerifiedMainnetProvider(walletAddress);
    let signature: string | undefined;
    if (quote.permitData) {
      const permitData = quote.permitData;
      if (!isRecord(permitData.domain) || !isRecord(permitData.types) || !isRecord(permitData.values)) {
        throw new Error("The quote returned malformed Permit2 typed data. Request a new quote.");
      }
      const typedData = {
        domain: permitData.domain,
        types: permitData.types,
        primaryType: "PermitSingle",
        message: permitData.values,
      };
      const signed = await provider.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(typedData)],
      });
      if (typeof signed !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signed)) {
        throw new Error("The wallet did not return a valid 65-byte Permit2 signature.");
      }
      signature = signed;
    }

    const response = await fetch("/api/uniswap/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteSession: quote.quoteSession,
        ...(signature ? { signature } : {}),
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(data)) {
      if (isRecord(data) && isRecord(data.approvalTransaction)) {
        throw new Error("An exact ERC-20 approval to Permit2 is required first. This interface does not submit approval transactions. Request a fresh quote after completing approval through an approved wallet flow.");
      }
      const message = isRecord(data) && typeof data.detail === "string"
        ? data.detail
        : isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Mainnet transaction preparation failed. Request a fresh quote.";
      throw new Error(message);
    }
    if (
      data.ok !== true ||
      data.executionEnabled !== false ||
      !isRecord(data.transaction) ||
      Number(data.chainId) !== 5042 ||
      Number(data.transaction.chainId) !== 5042 ||
      String(data.transaction.from || "").toLowerCase() !== account.toLowerCase()
    ) {
      throw new Error("The server did not return a valid unsigned Arc Mainnet transaction. Nothing was submitted.");
    }

    const validation = isRecord(data.validation) ? data.validation : undefined;
    setPrepared({
      transaction: {
        chainId: 5042,
        from: String(data.transaction.from),
        to: String(data.transaction.to),
        value: String(data.transaction.value || "0"),
        gasLimit: String(data.transaction.gasLimit || ""),
      },
      validation: validation ? {
        estimatedGas: typeof validation.estimatedGas === "string" ? validation.estimatedGas : undefined,
        estimatedGasCost: typeof validation.estimatedGasCost === "string" ? validation.estimatedGasCost : undefined,
        minimumAmountOut: typeof validation.minimumAmountOut === "string" ? validation.minimumAmountOut : undefined,
        commandNames: Array.isArray(validation.commandNames) ? validation.commandNames.filter((v): v is string => typeof v === "string") : undefined,
      } : undefined,
    });
    setNotice("Unsigned Mainnet transaction prepared and validated. AGFusion did not sign or broadcast the transaction.");
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
      if (meta.isMainnet) {
        await prepareMainnetTransaction();
        return;
      }
      const tx = await executeSwap({ amount, tokenIn, tokenOut, chain: "Arc_Testnet", slippageBps });
      addTransaction(tx);
      setActiveTx(tx.id);
      if (tx.status === "success") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap confirmed on-chain!");
      } else if (tx.status === "retryable") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap submitted to Arc Testnet. Finality is confirming in the background.");
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

  const minOutput = quote?.minimumAmountOut || (quote?.amountOut ? minimumReceived(quote.amountOut, slippage) : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">{meta.name} Swap</p>
        <Badge variant="cyan" className="shrink-0">{meta.isMainnet ? "Uniswap · Quote only" : "USDC · EURC"}</Badge>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">From</span>
            <select value={tokenIn} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenIn(e.target.value as ArcSwapToken); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" className="mb-0.5 h-10 w-10 shrink-0 px-0 rounded-xl" disabled={quoteBusy || swapBusy} onClick={flip} aria-label="Reverse swap"><ArrowDownUp className="h-4 w-4" /></Button>
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">To</span>
            <select value={tokenOut} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenOut(e.target.value as ArcSwapToken); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Amount</span>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} disabled={quoteBusy || swapBusy} onChange={(e) => { setAmount(e.target.value); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} placeholder="0.50" />
        </label>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Slippage tolerance</span></div>
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
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Minimum receive</p><p className="mt-0.5 text-slate-200 font-medium">{prettyAmount(minOutput)} {tokenOut}</p></div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Route</p><p className="mt-0.5 text-slate-200 font-medium">{quote.route || "Arc DEX"}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />{meta.isMainnet ? "Server-validated quote" : "Verified on-chain"}</span>
            <span className="font-semibold text-cyan-300">{slippage}% slippage</span>
          </div>
          {meta.isMainnet && quote.quoteSessionExpiresAt && (
            <p className="text-[10px] text-slate-500">Quote session expires at {new Date(quote.quoteSessionExpiresAt * 1000).toLocaleTimeString()}.</p>
          )}
          {meta.isMainnet && quote.estimatedGasUsd && <p className="text-[10px] text-slate-500">Estimated gas: ${quote.estimatedGasUsd}</p>}
        </div>
      )}

      {prepared && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5 space-y-2">
          <p className="text-xs font-semibold text-amber-200">Unsigned Mainnet transaction prepared</p>
          <p className="text-[11px] text-slate-300">The server validated the transaction and simulation. It has not been signed or broadcast.</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><span className="text-slate-500">Destination</span><p className="break-all text-slate-200">{prepared.transaction.to}</p></div>
            <div><span className="text-slate-500">Gas limit</span><p className="text-slate-200">{prepared.transaction.gasLimit}</p></div>
            {prepared.validation?.estimatedGas && <div><span className="text-slate-500">Estimated gas</span><p className="text-slate-200">{prepared.validation.estimatedGas}</p></div>}
            {prepared.validation?.estimatedGasCost && <div><span className="text-slate-500">Estimated gas cost</span><p className="text-slate-200">{prepared.validation.estimatedGasCost} wei</p></div>}
          </div>
        </div>
      )}

      {notice && <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-cyan-200">{notice}</div>}
      {error && <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-red-200 whitespace-pre-wrap">{error}</div>}

      {!quote && <Button className="w-full font-semibold" disabled={!canQuote || quoteBusy || swapBusy} onClick={() => void getQuote()}>{quoteBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting quote…</> : "Get Quote"}</Button>}

      {quote && (
        <div className="space-y-2">
          <Button className="w-full font-semibold" disabled={swapBusy || !walletAddress || !!prepared} onClick={() => void swap()}>
            {swapBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{meta.isMainnet ? "Preparing transaction…" : "Confirming in wallet…"}</> : meta.isMainnet ? "Prepare Mainnet transaction" : "Confirm Swap"}
          </Button>
          <Button type="button" variant="outline" className="w-full text-xs h-9" disabled={swapBusy} onClick={() => void getQuote()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh Quote
          </Button>
          {meta.isMainnet && (
            <p className="text-center text-[10px] text-slate-500">Preparation is controlled by a server-side Preview gate. Production transaction preparation remains blocked.</p>
          )}
        </div>
      )}
    </div>
  );
}
