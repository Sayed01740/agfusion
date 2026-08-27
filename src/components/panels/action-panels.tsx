"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePilotStore } from "@/store/pilot-store";
import { CHAIN_LIST, CHAINS } from "@/lib/chains";
import { cn } from "@/lib/utils";
import {
  executeBridge,
  executeBridgeRecovery,
  executeSend,
  executeSwap,
  executeUnifiedDeposit,
} from "@/lib/client-actions";
import type { ChainId, TransactionRecord } from "@/types";
import { EVM_BRIDGE_CHAINS, CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import {
  bridgeStateToSteps,
  loadBridgeState,
  saveBridgeState,
  type BridgeState,
} from "@/lib/bridge-state";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import {
  quoteBridgeFee,
  quoteSendFee,
  quoteSwapFee,
} from "@/lib/fees";

/** @deprecated Prefer ToolsWorkspace on the dashboard */
export function ActionPanels() {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Send</p>
        <SendPanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Swap</p>
        <SwapPanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Bridge</p>
        <BridgePanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Unified Balance</p>
        <UnifiedBalancePanelBody />
      </div>
      <RecoveryPanelBody />
    </div>
  );
}export function BridgePanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode, walletType } =
    usePilotStore();
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState<ChainId>("Arc_Testnet");
  const [to, setTo] = useState<ChainId>("Base_Sepolia");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [liveBridgeState, setLiveBridgeState] = useState<BridgeState | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const activeTxId = usePilotStore((s) => s.activeTxId);
  const mode = executionMode();

  // Wallet type determines the available bridge routes (Phase 2/12):
  // - Circle Email Wallet: only Arc ↔ Base (the chains Circle PW can execute)
  // - EVM wallets: all verified CCTP v2 testnet routes (Sonic excluded — SDK
  //   chainId 14601 does not match live Blaze 57054)
  const CCTP_BRIDGE_CHAINS: ChainId[] =
    walletType === "circle" ? CIRCLE_BRIDGE_CHAINS : EVM_BRIDGE_CHAINS;

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

    // Create placeholder transaction for live UI stepper
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
        token: "USDC",
        preferLive: true,
        txId,
      });

      const finalState = (transaction as TransactionRecord & { bridgeState?: BridgeState }).bridgeState ?? loadBridgeState(txId);
      if (finalState) setLiveBridgeState(finalState);
      usePilotStore.getState().updateTransaction(txId, {
        status: transaction.status === "success" ? "success" : "error",
        txHash: transaction.txHash,
        explorerUrl: transaction.explorerUrl,
        steps: transaction.steps,
        message: transaction.message,
        bridgeResult: (transaction as any).bridgeResult,
        bridgeState: finalState ?? undefined,
      });
    } catch (e: any) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      const partialState = (e as any)?.bridgeState as BridgeState | undefined;
      if (partialState) setLiveBridgeState(partialState);
      usePilotStore.getState().updateTransaction(txId, {
        status: "error",
        message: err,
        retryable: true,
        bridgeResult: (e as any)?.bridgeResult,
        bridgeState: (partialState ?? (loadBridgeState(txId) as BridgeState | null)) ?? undefined,
        steps: (loadBridgeState(txId)
          ? bridgeStateToSteps(loadBridgeState(txId))
          : initialSteps.map((s) =>
              s.state === "pending" ? { ...s, state: "error" as const, message: err } : s,
            )),
      });
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Field label="Amount (USDC)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
          <Field label="From network">
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 min-w-0"
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
          </Field>
          <div className="flex justify-center sm:block sm:pb-0.5">
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
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 min-w-0"
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
          </Field>
        </div>

<p className="text-[11px] text-slate-500 leading-relaxed">
          Funds leave{" "}
          <strong className="text-slate-300">{from.replace(/_/g, " ")}</strong>.
          You need USDC on the <em>from</em> network before bridging.
        </p>
        <FeeLineItems quote={quoteBridgeFee(amount)} compact />

        {/* Real bridge progress (Phase 10) — restored from persisted state after reload */}
        {lastTxId && liveBridgeState && (
          <BridgeProgressStepper state={liveBridgeState} txId={lastTxId} />
        )}

        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap leading-relaxed">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Transferring…" : "Continue · Confirm transfer"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Confirm transfer"
        summary={`Move ${amount} USDC from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}. Review fees, then confirm in your wallet.`}
        feeQuote={quoteBridgeFee(amount)}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}

/** Real per-step bridge progress with tx hashes (Phase 10). */
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

export function SwapPanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode } =
    usePilotStore();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [kitKeyInput, setKitKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState("Checking kit key…");
  const mode = executionMode();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/kit?check=1", { cache: "no-store" });
        const data = (await res.json()) as {
          configured?: boolean;
          valid?: boolean | null;
          kitKey?: string | null;
          message?: string;
          hint?: string;
        };
        if (data.kitKey) {
          const { setSessionKitKey } = await import("@/lib/kit-key");
          try {
            setSessionKitKey(data.kitKey);
          } catch {
            /* ignore */
          }
        }
        if (data.valid === true) {
          setHasKey(true);
          setKeyStatus(
            `Circle kit key OK${data.hint ? ` (${data.hint})` : ""} · ready to swap`,
          );
          return;
        }
        if (data.configured && data.valid === false) {
          setHasKey(false);
          setKeyStatus(
            "Circle rejected the kit key on the server — create a NEW Kit key and update Vercel KIT_KEY",
          );
          setError(data.message || null);
          return;
        }
        if (data.configured && data.kitKey) {
          setHasKey(true);
          setKeyStatus("Kit key loaded · ready to swap");
          return;
        }
        setHasKey(false);
        setKeyStatus(
          "No KIT_KEY on server — owner must set it on Vercel (users should not paste)",
        );
      } catch {
        setKeyStatus("Could not verify kit key — try again");
      }
    })();
  }, []);

  async function saveKey() {
    const {
      setSessionKitKey,
      hasKitKey,
      normalizeKitKey,
      getPublicKitKey,
      isValidKitKeyShape,
    } = await import("@/lib/kit-key");
    try {
      const n = normalizeKitKey(kitKeyInput);
      if (!isValidKitKeyShape(n)) {
        setError(
          "Invalid format. Use KIT_KEY:id:secret (both parts hex). From console.circle.com → Keys → Kit keys.",
        );
        return;
      }
      setSessionKitKey(n);
      const stored = getPublicKitKey();
      setHasKey(hasKitKey());
      setKeyStatus(
        stored
          ? "Kit key saved · ready to swap"
          : "Save failed — try again",
      );
      setError(null);
      setKitKeyInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save key");
    }
  }

  async function clearKey() {
    const { clearSessionKitKey, ensureKitKey, isValidKitKeyShape } =
      await import("@/lib/kit-key");
    clearSessionKitKey();
    const key = await ensureKitKey();
    const ok = Boolean(key && isValidKitKeyShape(key));
    setHasKey(ok);
    setKeyStatus(
      ok
        ? "Using server kit key · ready to swap"
        : "Cleared. Paste a new key or set KIT_KEY on Vercel.",
    );
    setError(null);
  }

  async function run() {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    setConfirm(false);
    try {
      const { setSessionKitKey, ensureKitKey } = await import("@/lib/kit-key");
      if (kitKeyInput.trim()) {
        setSessionKitKey(kitKeyInput.trim());
        setHasKey(true);
      }
      const key = await ensureKitKey();
      if (!key) {
        throw new Error(
          "No kit key found. Paste it in the box above and click Save key, then swap again.",
        );
      }
      const transaction = await executeSwap({
        amount,
        tokenIn: "USDC",
        tokenOut: "EURC",
        chain: "Arc_Testnet",
      });
      addTransaction(transaction);
      setActiveTx(transaction.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Swap failed. Connect wallet and save a Circle kit key.",
      );
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Field label="Amount (USDC → EURC on Arc)">
          <Input
            type="number"
            placeholder="50"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Live swap on Arc Testnet. Your wallet will ask you to sign — that is
          normal.
        </p>
        <FeeLineItems quote={quoteSwapFee(amount)} compact />

        <div
          className={`space-y-2 rounded-xl border p-2.5 ${
            hasKey
              ? "border-emerald-500/25 bg-emerald-500/5"
              : "border-amber-500/25 bg-amber-500/5"
          }`}
        >
          <p
            className={`text-[11px] leading-relaxed ${
              hasKey ? "text-emerald-200/90" : "text-amber-100/90"
            }`}
          >
            {keyStatus}
          </p>
          {!hasKey && (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Site owner sets Circle kit key on the server. If swap fails, paste
              a kit key from{" "}
              <a
                href="https://console.circle.com"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 underline"
              >
                console.circle.com
              </a>{" "}
              → Keys → Kit keys.
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Optional kit key if server key fails…"
              value={kitKeyInput}
              onChange={(e) => setKitKeyInput(e.target.value)}
              className="text-xs h-9 flex-1 min-w-[140px]"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void saveKey()}
              disabled={!kitKeyInput.trim()}
            >
              Save key
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void clearKey()}
            >
              Clear
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap leading-relaxed">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          variant="secondary"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Swapping…" : "Continue · Confirm swap"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        feeQuote={quoteSwapFee(amount)}
        title="Confirm swap"
        summary={`Swap ${amount} USDC → EURC on Arc Testnet with your connected wallet.`}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}

export function SendPanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode } =
    usePilotStore();
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
      const transaction = await executeSend({
        amount,
        token: "USDC",
        chain: "Arc_Testnet",
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
        <Field label="Amount (USDC on Arc)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Recipient wallet (0x address)">
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={busy}
            placeholder="0x… paste full address"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </Field>
        <FeeLineItems quote={quoteSendFee(amount)} compact />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Sending…" : "Continue · Confirm send"}
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

export function RecoveryPanelBody() {
  const { addTransaction, setActiveTx, setThinking, transactions, activeTxId } =
    usePilotStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The failed bridge to recover: the active tx if it's a failed bridge,
  // otherwise the most recent failed/retryable bridge (Phase 11).
  const failedTx: TransactionRecord | null =
    (transactions.find(
      (t) => t.id === activeTxId && t.type === "bridge" && (t.status === "error" || t.status === "retryable"),
    ) as TransactionRecord | undefined) ??
    (transactions.find(
      (t) => t.type === "bridge" && (t.status === "error" || t.status === "retryable"),
    ) as TransactionRecord | undefined) ??
    null;

  async function run() {
    if (!failedTx?.fromChain || !failedTx.toChain) {
      setError("No failed bridge to recover.");
      return;
    }
    setError(null);
    setBusy(true);
    setThinking(true);
    try {
      // Recover the EXACT failed transaction — never a hardcoded bridge.
      const tx = await executeBridgeRecovery({
        amount: failedTx.amount || "0",
        fromChain: failedTx.fromChain,
        toChain: failedTx.toChain,
        token: failedTx.token || "USDC",
        recipient: failedTx.recipient,
        failedTx,
        txId: failedTx.id,
      });
      addTransaction(tx);
      setActiveTx(tx.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  if (!failedTx?.fromChain || !failedTx.toChain) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Resume the failed bridge{" "}
        <strong className="text-slate-300">
          {failedTx.amount} USDC {failedTx.fromChain.replace(/_/g, " ")} →{" "}
          {failedTx.toChain.replace(/_/g, " ")}
        </strong>
        . AGFusion resumes from the last confirmed step and will not burn again.
      </p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={busy}
        type="button"
        onClick={() => void run()}
      >
        {busy ? "Recovering…" : `Resume ${failedTx.amount} USDC bridge`}
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function UnifiedBalancePanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode } =
    usePilotStore();
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState<ChainId>("Base_Sepolia");
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
    setError(null);
    setBusy(true);
    setThinking(true);
    setConfirm(false);
    try {
      const transaction = await executeUnifiedDeposit({
        amount,
        fromChain: from,
      });
      addTransaction(transaction);
      setActiveTx(transaction.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Deposit failed — check source USDC and wallet network",
      );
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Field label="Deposit Amount (USDC)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="From network">
          <select
            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 min-w-0"
            value={from}
            disabled={busy}
            onChange={(e) => setFrom(e.target.value as ChainId)}
          >
            {CHAIN_LIST.filter((c) => c.id !== "Solana_Devnet").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Deposit USDC from <strong className="text-slate-300">{from.replace(/_/g, " ")}</strong> into your Unified Balance. 
          This abstracts away the underlying chain so it can be spent on Arc.
        </p>
        <FeeLineItems quote={quoteBridgeFee(amount)} compact />
        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap leading-relaxed">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Processing…" : "Continue · Confirm deposit"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Confirm deposit"
        summary={`Deposit ${amount} USDC from ${from.replace(/_/g, " ")} to your Unified Balance.`}
        feeQuote={quoteBridgeFee(amount)}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}
