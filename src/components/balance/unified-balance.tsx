"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Layers, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePilotStore } from "@/store/pilot-store";
import { formatUsd } from "@/lib/utils";
import {
  executeUnifiedDeposit,
  executeUnifiedSpend,
} from "@/lib/client-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function UnifiedBalanceCard({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const {
    balances,
    liveBalanceUsdc,
    walletAddress,
    addTransaction,
    setActiveTx,
    setThinking,
    executionMode,
    refreshBalances,
  } = usePilotStore();
  const liveN = Number(String(liveBalanceUsdc || "").replace(/,/g, ""));
  // Prefer live wallet balance; never fall back to fake demo portfolio totals
  const total =
    walletAddress && Number.isFinite(liveN)
      ? liveN
      : walletAddress
        ? balances.totalUsd
        : 0;
  const [amount, setAmount] = useState("1");
  const [depositFrom, setDepositFrom] = useState<"Base_Sepolia" | "Ethereum_Sepolia">(
    "Base_Sepolia",
  );
  const [spendTo, setSpendTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"deposit" | "spend" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);

  const byChain = balances.balances.reduce<
    Record<string, { label: string; value: number; color: string }>
  >((acc, b) => {
    if (!acc[b.chain]) {
      acc[b.chain] = { label: b.chainLabel, value: 0, color: b.color };
    }
    acc[b.chain].value += b.usdValue;
    return acc;
  }, {});
  const segments = Object.values(byChain);
  const max = Math.max(...segments.map((s) => s.value), 1);
  const mode = executionMode();

  async function runDeposit() {
    setBusy(true);
    setThinking(true);
    setConfirm(null);
    setErr(null);
    setLastNote(null);
    try {
      const tx = await executeUnifiedDeposit({
        amount,
        fromChain: depositFrom,
      });
      addTransaction(tx);
      setActiveTx(tx.id);
      setLastNote(
        tx.message ||
          `Deposited ${amount} USDC from ${depositFrom.replace(/_/g, " ")}`,
      );
      refreshBalances();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  async function runSpend() {
    const to = spendTo.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      setErr("Paste a full 0x recipient address before spending.");
      setConfirm(null);
      return;
    }
    setErr(null);
    setLastNote(null);
    setBusy(true);
    setThinking(true);
    setConfirm(null);
    try {
      const tx = await executeUnifiedSpend({
        amount,
        recipient: to,
        recipientLabel: "Unified spend → Arc",
      });
      addTransaction(tx);
      setActiveTx(tx.id);
      setLastNote(tx.message || `Spent ${amount} USDC on Arc`);
      refreshBalances();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Spend failed");
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  const header = (
          <div className="flex items-start justify-between gap-2">
          <div>
            {!embedded && (
            <div className="flex items-center gap-2 text-xs text-cyan-300/80 mb-1">
              <Layers className="h-3.5 w-3.5" />
              Unified Balance
            </div>
            )}
            <p className={embedded ? "text-2xl font-semibold tracking-tight text-slate-50" : "text-3xl font-semibold tracking-tight text-slate-50"}>
              <motion.span
                key={total}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {formatUsd(total)}
              </motion.span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {walletAddress
                ? `Live Arc USDC${liveBalanceUsdc ? ` · ${liveBalanceUsdc}` : ""}`
                : "Connect wallet for live Arc USDC"}
            </p>
            {walletAddress && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 h-7 px-2 text-[11px]"
                type="button"
                onClick={() => refreshBalances()}
              >
                Refresh balance
              </Button>
            )}
            {walletAddress && liveBalanceUsdc && (
              <p className="text-[11px] text-emerald-400/90 mt-1">
                Wallet on Arc: {Number(liveBalanceUsdc).toFixed(4)} USDC
              </p>
            )}
          </div>
          <Badge variant="cyan" className="gap-1">
            <TrendingUp className="h-3 w-3" />
            Live
          </Badge>
          </div>
  );

  const body = (
        <div className="space-y-4">
        {header}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-900">
            {segments.map((s) => (
              <motion.div
                key={s.label}
                initial={{ width: 0 }}
                animate={{ width: `${(s.value / total) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ background: s.color }}
                className="h-full"
                title={`${s.label}: ${formatUsd(s.value)}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {segments.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-slate-300">{s.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block h-1.5 w-16 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.value / max) * 100}%`,
                        background: s.color,
                      }}
                    />
                  </div>
                  <span className="font-medium tabular-nums text-slate-100">
                    {formatUsd(s.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 pt-3 space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Amount (USDC)
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Deposit from chain
            </label>
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100"
              value={depositFrom}
              disabled={busy}
              onChange={(e) =>
                setDepositFrom(
                  e.target.value as "Base_Sepolia" | "Ethereum_Sepolia",
                )
              }
            >
              <option value="Base_Sepolia">Base Sepolia</option>
              <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
            </select>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Spend recipient on Arc (0x)
            </label>
            <Input
              value={spendTo}
              onChange={(e) => setSpendTo(e.target.value)}
              disabled={busy}
              placeholder="0x… wallet you control"
              spellCheck={false}
            />
            {err && (
              <p className="text-xs text-red-400 whitespace-pre-wrap">{err}</p>
            )}
            {lastNote && (
              <p className="text-xs text-emerald-400/90">{lastNote}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !walletAddress}
                type="button"
                onClick={() => setConfirm("deposit")}
              >
                {busy && confirm === "deposit" ? "…" : "Deposit (Gateway)"}
              </Button>
              <Button
                size="sm"
                disabled={busy || !walletAddress}
                type="button"
                onClick={() => setConfirm("spend")}
              >
                {busy && confirm === "spend" ? "…" : "Spend on Arc"}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Deposit USDC from another chain into Gateway, then spend on Arc.
            </p>
          </div>
        </div>
  );

  return (
    <>
      {embedded ? (
        body
      ) : (
        <Card className="glow-border overflow-hidden">
          <CardContent className="pt-5">{body}</CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirm === "deposit"}
        title="Deposit to Unified Balance"
        summary={`Deposit ${amount} USDC from ${depositFrom.replace(/_/g, " ")} into Circle Gateway Unified Balance. Wallet will switch to the source network.`}
        feeUsd={0.05}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runDeposit()}
      />
      <ConfirmDialog
        open={confirm === "spend"}
        title="Spend Unified Balance on Arc"
        summary={`Spend ${amount} USDC on Arc Testnet to ${spendTo.trim() || "recipient"} via Gateway / App Kit.`}
        feeUsd={0.08}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runSpend()}
      />
    </>
  );
}
