"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePilotStore } from "@/store/pilot-store";
import { CHAIN_LIST, CHAINS } from "@/lib/chains";
import {
  executeBridge,
  executeBridgeRecovery,
  executeSend,
  executeSwap,
  executeUnifiedDeposit,
} from "@/lib/client-actions";
import type { ChainId } from "@/types";
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
}

export function BridgePanelBody() {
  const { addTransaction, setActiveTx, setThinking, executionMode } =
    usePilotStore();
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState<ChainId>("Arc_Testnet");
  const [to, setTo] = useState<ChainId>("Base_Sepolia");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const mode = executionMode();

  // Only show chains that have Circle CCTP v2 contracts deployed on testnet.
  // Chains not in this set (Monad, Cronos, Edge, etc.) have no CCTP support
  // and would fail at the burn step with "contract not found".
  const CCTP_BRIDGE_CHAINS: ChainId[] = [
    "Arc_Testnet",
    "Ethereum_Sepolia",
    "Base_Sepolia",
    "Arbitrum_Sepolia",
    "Optimism_Sepolia",
    "Polygon_Amoy_Testnet",
    "Avalanche_Fuji",
    "Unichain_Sepolia",
    "Linea_Sepolia",
    "Sonic_Testnet",
  ];

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
    try {
      const transaction = await executeBridge({
        amount,
        fromChain: from,
        toChain: to,
        token: "USDC",
        preferLive: true,
      });
      addTransaction(transaction);
      setActiveTx(transaction.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Bridge failed — check source USDC and wallet network",
      );
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
  const { addTransaction, setActiveTx, setThinking } = usePilotStore();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setThinking(true);
    try {
      const tx = await executeBridgeRecovery({
        amount: "50",
        fromChain: "Base_Sepolia",
        toChain: "Arc_Testnet",
      });
      addTransaction(tx);
      setActiveTx(tx.id);
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Resume a bridge that stalled mid-route. Connect on Arc Testnet, then
        retry the incomplete step.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={busy}
        type="button"
        onClick={() => void run()}
      >
        {busy ? "Recovering…" : "Retry failed transfer"}
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
