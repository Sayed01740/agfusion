"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  prettyAmount,
  type ArcSwapToken,
  type PendingApprovalTransaction,
  type PreparedMainnetTransaction,
  type SwapQuote,
} from "./swap-helpers";

export function SwapQuoteSummaryCard({
  quote,
  tokenIn,
  tokenOut,
  minOutput,
  slippage,
  isMainnet,
  needsTokenApproval,
  approvalMode,
  swapBusy,
  onApprovalModeChange,
}: {
  quote: SwapQuote;
  tokenIn: ArcSwapToken;
  tokenOut: ArcSwapToken;
  minOutput: string;
  slippage: string;
  isMainnet: boolean;
  needsTokenApproval: boolean;
  approvalMode: "exact" | "unlimited";
  swapBusy: boolean;
  onApprovalModeChange: (mode: "exact" | "unlimited") => void;
}) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.04] p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">Estimated receive</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {prettyAmount(quote.amountOut)} {tokenOut}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-card/70 p-2">
          <p className="text-muted-foreground text-[10px]">Minimum receive</p>
          <p className="mt-0.5 text-foreground font-medium tabular-nums">
            {prettyAmount(minOutput)} {tokenOut}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card/70 p-2">
          <p className="text-muted-foreground text-[10px]">Route</p>
          <p className="mt-0.5 text-foreground font-medium truncate">
            {quote.route || "Arc DEX"}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          {isMainnet ? "Server-validated quote" : "Verified on-chain"}
        </span>
        <span className="font-semibold text-accent">{slippage}% slippage</span>
      </div>
      {isMainnet && tokenIn !== "USDC" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[10px]">
          <span className="flex items-center gap-1.5 text-slate-300">
            {needsTokenApproval ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Step 1: Approve {tokenIn} for Permit2
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Permit2 Allowance: Ready
              </>
            )}
          </span>
          {needsTokenApproval && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={swapBusy}
                onClick={() => onApprovalModeChange("exact")}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  approvalMode === "exact"
                    ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Exact
              </button>
              <button
                type="button"
                disabled={swapBusy}
                onClick={() => onApprovalModeChange("unlimited")}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  approvalMode === "unlimited"
                    ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Unlimited
              </button>
            </div>
          )}
        </div>
      )}
      {isMainnet && quote.quoteSessionExpiresAt && (
        <p className="text-[10px] text-slate-500">
          Quote session expires at {new Date(quote.quoteSessionExpiresAt * 1000).toLocaleTimeString()}.
        </p>
      )}
      {isMainnet && quote.estimatedGasUsd && (
        <p className="text-[10px] text-slate-500">Estimated gas: ${quote.estimatedGasUsd}</p>
      )}
    </div>
  );
}

export function SwapPendingApprovalCard({
  pendingApproval,
  swapBusy,
  onApprove,
}: {
  pendingApproval: PendingApprovalTransaction;
  swapBusy: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5 space-y-2.5">
      <p className="text-xs font-semibold text-amber-200">Permit2 ERC-20 Approval Required</p>
      <p className="text-[11px] text-slate-300">
        Approve the exact input amount ({pendingApproval.amount} base units) to Permit2 ({pendingApproval.spender}).
      </p>
      <Button className="w-full font-semibold" disabled={swapBusy} onClick={onApprove}>
        {swapBusy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Approving in wallet…
          </>
        ) : (
          "Approve Exact Amount to Permit2"
        )}
      </Button>
    </div>
  );
}

export function SwapPreparedTxCard({
  prepared,
  swapBusy,
  onExecute,
}: {
  prepared: PreparedMainnetTransaction;
  swapBusy: boolean;
  onExecute: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5 space-y-2.5">
      <p className="text-xs font-semibold text-amber-200">
        {prepared.executionEnabled ? "Validated Mainnet Swap Ready" : "Unsigned Mainnet transaction prepared"}
      </p>
      <p className="text-[11px] text-slate-300">
        {prepared.executionEnabled
          ? "The server validated the Universal Router 2.1.2 calldata and passed simulation."
          : "The server validated the transaction and simulation. It has not been signed or broadcast."}
      </p>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="text-slate-500">Destination</span>
          <p className="break-all text-slate-200">{prepared.transaction.to}</p>
        </div>
        <div>
          <span className="text-slate-500">Gas limit</span>
          <p className="text-slate-200">{prepared.transaction.gasLimit}</p>
        </div>
        {prepared.validation?.estimatedGas && (
          <div>
            <span className="text-slate-500">Estimated gas</span>
            <p className="text-slate-200">{prepared.validation.estimatedGas}</p>
          </div>
        )}
        {prepared.validation?.estimatedGasCost && (
          <div>
            <span className="text-slate-500">Estimated gas cost</span>
            <p className="text-slate-200">{prepared.validation.estimatedGasCost} wei</p>
          </div>
        )}
      </div>
      {prepared.executionEnabled && (
        <Button className="w-full font-semibold" disabled={swapBusy} onClick={onExecute}>
          {swapBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Broadcasting Swap…
            </>
          ) : (
            "Sign & Broadcast Mainnet Swap"
          )}
        </Button>
      )}
    </div>
  );
}
