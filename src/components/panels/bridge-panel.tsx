"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { ChainMark } from "@/components/brand/chain-mark";
import { TokenMark } from "@/components/brand/token-mark";
import { Field } from "@/components/panels/field";
import { usePilotStore } from "@/store/pilot-store";
import { CHAINS } from "@/lib/chains";
import { getArcNetworkMeta } from "@/lib/arc-chain";
import { cn } from "@/lib/utils";
import { executeBridge } from "@/lib/client-actions";
import { getEvmBridgeChains, getCircleBridgeChains } from "@/lib/cctp-chains";
import {
  bridgeStateToSteps,
  loadBridgeState,
  saveBridgeState,
  type BridgeState,
} from "@/lib/bridge-state";
import { quoteBridgeFee } from "@/lib/fees";
import type { ChainId, TransactionRecord } from "@/types";

type BridgeErrorWithState = Error & {
  bridgeState?: BridgeState;
  bridgeResult?: TransactionRecord["bridgeResult"];
};

export function BridgePanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode, walletType, walletChainId, networkMode } =
    usePilotStore();
  const effectiveChainId =
    walletChainId === 5042 || walletChainId === 5042002
      ? walletChainId
      : networkMode === "mainnet"
        ? 5042
        : 5042002;
  const meta = getArcNetworkMeta(effectiveChainId);
  const isMainnet = meta.isMainnet;

  const CCTP_BRIDGE_CHAINS: ChainId[] = useMemo(() => {
    return walletType === "circle"
      ? getCircleBridgeChains(isMainnet)
      : getEvmBridgeChains(isMainnet);
  }, [walletType, isMainnet]);

  const defaultFrom: ChainId = isMainnet ? "Arc_Mainnet" : "Arc_Testnet";
  const defaultTo: ChainId = isMainnet ? "Base" : "Base_Sepolia";

  const [amount, setAmount] = useState("10");
  const [bridgeToken, setBridgeToken] = useState<"USDC" | "EURC" | "cirBTC" | "wETH">("USDC");
  const [transferSpeed, setTransferSpeed] = useState<"FAST" | "SLOW">("FAST");
  const [from, setFrom] = useState<ChainId>(defaultFrom);
  const [to, setTo] = useState<ChainId>(defaultTo);
  const [bridgeMode, setBridgeMode] = useState<"fast-direct" | "auto-relayer">("fast-direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [liveBridgeState, setLiveBridgeState] = useState<BridgeState | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const activeTxId = usePilotStore((s) => s.activeTxId);
  const activeTx = usePilotStore((s) => s.transactions.find((t) => t.id === (lastTxId || s.activeTxId)));
  const currentBridgeState = activeTx?.bridgeState ?? liveBridgeState;
  const mode = executionMode();

  // Sync chains if active network flips between testnet and mainnet
  useEffect(() => {
    if (!CCTP_BRIDGE_CHAINS.includes(from)) {
      setFrom(CCTP_BRIDGE_CHAINS[0] ?? defaultFrom);
    }
    if (!CCTP_BRIDGE_CHAINS.includes(to)) {
      const fallbackTo = CCTP_BRIDGE_CHAINS[1] ?? defaultTo;
      setTo(fallbackTo);
    }
  }, [CCTP_BRIDGE_CHAINS, from, to, defaultFrom, defaultTo]);

  // Restore progress of the last bridge from persisted state (Phase 10).
  useEffect(() => {
    const active = activeTxId;
    if (!active) return;
    const st = loadBridgeState(active);
    if (st && st.fromChain === from && st.toChain === to) {
      setLiveBridgeState(st);
      setLastTxId(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTxId]);

  function flipDirection() {
    setFrom(to);
    setTo(from);
    setError(null);
  }

  async function run() {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (from === to) {
      setError("Pick different source and destination chains");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    setConfirm(false);

    const txId = `tx_${Date.now()}`;
    const initialSteps = [
      { name: "Approval", state: "pending" as const },
      { name: "Burn", state: "pending" as const },
      { name: "Attestation", state: "pending" as const },
      { name: "Destination Mint", state: "pending" as const },
    ];

    const walletAddress = usePilotStore.getState().walletAddress;
    const bState: BridgeState = {
      txId,
      walletType: walletType === "circle" ? "circle" : "evm",
      walletAddress,
      fromChain: from,
      toChain: to,
      token: "USDC",
      amount,
      state: "INIT",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveBridgeState(bState);
    setLiveBridgeState(bState);
    setLastTxId(txId);

    const placeholderTx = {
      id: txId,
      type: "bridge" as const,
      status: "pending" as const,
      amount,
      token: "USDC",
      fromChain: from,
      toChain: to,
      feeUsd: 0.05,
      steps: initialSteps,
      createdAt: new Date().toISOString(),
      message: `Bridging ${amount} USDC ${from} → ${to}`,
      executionMode: "live" as const,
      bridgeState: bState,
    };

    addTransaction(placeholderTx);
    setActiveTx(txId);

    try {
      const transaction = await executeBridge({
        amount,
        fromChain: from,
        toChain: to,
        token: bridgeToken,
        preferLive: true,
        bridgeMode,
        transferSpeed,
        txId,
      });

      const finalState = transaction.bridgeState ?? loadBridgeState(txId);
      if (finalState) setLiveBridgeState(finalState);
      usePilotStore.getState().updateTransaction(txId, {
        status: transaction.status === "success" ? "success" : "error",
        txHash: transaction.txHash,
        explorerUrl: transaction.explorerUrl,
        steps: transaction.steps,
        message: transaction.message,
        bridgeResult: transaction.bridgeResult,
        bridgeState: finalState ?? undefined,
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      const bridgeErr = e as BridgeErrorWithState | null;
      const partialState = bridgeErr?.bridgeState;
      if (partialState) setLiveBridgeState(partialState);
      usePilotStore.getState().updateTransaction(txId, {
        status: "error",
        message: err,
        retryable: true,
        bridgeResult: bridgeErr?.bridgeResult,
        bridgeState: (partialState ?? (loadBridgeState(txId) as BridgeState | null)) ?? undefined,
        steps: loadBridgeState(txId)
          ? bridgeStateToSteps(loadBridgeState(txId))
          : initialSteps.map((s) =>
              s.state === "pending" ? { ...s, state: "error" as const, message: err } : s,
            ),
      });
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-1">
            <Field label="Token">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                  <TokenMark token={bridgeToken} size={18} />
                </span>
                <select
                  className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm font-semibold text-foreground focus:border-accent focus:outline-none"
                  value={bridgeToken}
                  disabled={busy}
                  onChange={(e) =>
                    setBridgeToken(e.target.value as "USDC" | "EURC" | "cirBTC" | "wETH")
                  }
                >
                  <option value="USDC">USDC</option>
                  <option value="EURC">EURC</option>
                  <option value="cirBTC">cirBTC</option>
                  <option value="wETH">wETH</option>
                </select>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label={`Amount (${bridgeToken})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="Speed">
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-slate-100"
                value={transferSpeed}
                disabled={busy}
                onChange={(e) => setTransferSpeed(e.target.value as "FAST" | "SLOW")}
              >
                <option value="FAST">Fast (~15s)</option>
                <option value="SLOW">Standard</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
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
                {CCTP_BRIDGE_CHAINS.map((id) => (
                  <option key={id} value={id}>
                    {CHAINS[id]?.label ?? id.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <div className="flex justify-center sm:block">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-10 px-0 sm:h-11 sm:w-11 rounded-xl"
              disabled={busy}
              title="Flip direction"
              onClick={flipDirection}
            >
              <span className="rotate-90 sm:rotate-0">⇄</span>
            </Button>
          </div>
          <Field label="To network">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                <ChainMark chain={to} compact size={18} />
              </span>
              <select
                className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground min-w-0 focus:border-accent focus:outline-none"
                value={to}
                disabled={busy}
                onChange={(e) => setTo(e.target.value as ChainId)}
              >
                {CCTP_BRIDGE_CHAINS.map((id) => (
                  <option key={id} value={id}>
                    {CHAINS[id]?.label ?? id.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Bridge Execution Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setBridgeMode("fast-direct")}
              className={cn(
                "rounded-lg p-2 text-left border transition-colors text-xs",
                bridgeMode === "fast-direct"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card/70 text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
            >
              <div className="font-semibold text-foreground">⚡ Fast Direct</div>
              <div className="text-[10px] text-accent font-medium">0.00 USDC Fee</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Self-mint on dest</div>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setBridgeMode("auto-relayer")}
              className={cn(
                "rounded-lg p-2 text-left border transition-colors text-xs",
                bridgeMode === "auto-relayer"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card/70 text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
            >
              <div className="font-semibold text-foreground">🤖 Auto-Relayer</div>
              <div className="text-[10px] text-accent font-medium">Low Tier Fee</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Gasless dest mint</div>
            </button>
          </div>
        </div>

        <FeeLineItems quote={quoteBridgeFee(amount, bridgeMode)} compact />

        {lastTxId && currentBridgeState && (
          <BridgeProgressStepper state={currentBridgeState} txId={lastTxId} />
        )}

        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap leading-relaxed">
            {error}
          </p>
        )}
        <Button
          className="w-full font-semibold"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Transferring…" : "Bridge USDC"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Confirm transfer"
        summary={`Move ${amount} USDC from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")} via ${bridgeMode === "fast-direct" ? "Fast Direct (0.00 USDC Circle fee)" : "Auto-Relayer (low fee)"}. Review fees, then confirm in your wallet.`}
        feeQuote={quoteBridgeFee(amount, bridgeMode)}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}

function BridgeProgressStepper({
  state,
  txId,
}: {
  state: BridgeState;
  txId: string;
}) {
  const steps = bridgeStateToSteps(state);
  const statusLabel: Record<string, string> = {
    INIT: "Waiting to start",
    APPROVAL_PENDING: "Approving USDC…",
    APPROVED: "USDC approved",
    BURN_PENDING: "Burning USDC on source…",
    BURN_CONFIRMED: "Burn confirmed — waiting for attestation",
    ATTESTATION_PENDING: "Waiting for Circle attestation…",
    ATTESTATION_RECEIVED: "Attestation received — minting…",
    DESTINATION_PENDING: "Minting on destination…",
    DESTINATION_CONFIRMED: "Mint confirmed",
    COMPLETED: "Bridge complete",
    FAILED: "Bridge failed",
    RECOVERABLE: "Bridge interrupted — recoverable",
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-slate-300">
          Bridge progress
        </p>
        <span className="text-[10px] text-slate-500">{txId}</span>
      </div>
      <p className="text-[11px] text-cyan-300">{statusLabel[state.state] ?? state.state}</p>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full shrink-0",
                s.state === "success" && "bg-emerald-400",
                s.state === "active" && "bg-cyan-400 animate-pulse",
                s.state === "error" && "bg-red-400",
                s.state === "pending" && "bg-slate-600",
              )}
            />
            <span
              className={cn(
                "flex-1",
                s.state === "error" && "text-red-300",
                s.state === "pending" && "text-slate-500",
              )}
            >
              {s.name}
            </span>
            {s.txHash && (
              <a
                href={`${CHAINS[state.fromChain]?.explorer ?? ""}/tx/${s.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-cyan-400/80 hover:text-cyan-300 underline truncate max-w-[120px]"
              >
                {s.txHash.slice(0, 10)}…
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
