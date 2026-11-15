"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { Field } from "@/components/panels/field";
import { usePilotStore } from "@/store/pilot-store";
import { ARC_NETWORK_NAME } from "@/lib/arc-chain";
import { executeSwap } from "@/lib/client-actions";
import { quoteSwapFee } from "@/lib/fees";

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
          Live swap on {ARC_NETWORK_NAME}. Your wallet will ask you to sign — that is
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
          className="w-full font-semibold"
          variant="secondary"
          disabled={busy}
          onClick={() => setConfirm(true)}
          type="button"
        >
          {busy ? "Swapping…" : "Swap Tokens"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        feeQuote={quoteSwapFee(amount)}
        title="Confirm swap"
        summary={`Swap ${amount} USDC → EURC on ${ARC_NETWORK_NAME} with your connected wallet.`}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run()}
      />
    </>
  );
}
