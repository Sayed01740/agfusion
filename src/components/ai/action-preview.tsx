"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock, Fuel, Route, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import type { ActionPreview } from "@/types";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/fees";
import { CHAINS } from "@/lib/chains";
import { useWallet } from "@/providers/wallet-provider";
import { usePilotStore } from "@/store/pilot-store";

function LiveSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <motion.span
      className={`inline-flex shrink-0 ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
      aria-label="Loading"
    >
      <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
      </svg>
    </motion.span>
  );
}

export function ActionPreviewCard({ preview, onExecute, busy = false }: { preview: ActionPreview; onExecute: () => void; busy?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signInSiwe } = useWallet();
  const walletType = usePilotStore((s) => s.walletType);
  const walletAddress = usePilotStore((s) => s.walletAddress);
  const done = Boolean(preview.executed);
  const cta = preview.type === "swap" ? "Confirm & open wallet to swap" : preview.type === "send" ? "Confirm & open wallet to send" : preview.type === "bridge" ? "Confirm & open wallet to transfer" : "Confirm & open wallet";

  async function ensureWalletServerSession() {
    const current = await fetch("/api/auth/me", { cache: "no-store" });
    const currentData = await current.json().catch(() => ({}));
    if (currentData?.authenticated === true) return;
    if (walletType === "circle") {
      if (!walletAddress) throw new Error("Connect your Circle Email Wallet before confirming.");
      const { getCircleSession } = await import("@/sdk/circle-pw");
      const circleSession = getCircleSession();
      if (!circleSession?.userToken) throw new Error("Your Circle Email Wallet session has expired. Reconnect the wallet and try again.");
      const sessionResponse = await fetch("/api/circle/pw/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userToken: circleSession.userToken, address: walletAddress }) });
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || sessionData?.ok !== true) throw new Error(sessionData?.message || "Could not authorize the connected Circle Email Wallet.");
      return;
    }
    const signedIn = await signInSiwe();
    if (!signedIn) throw new Error("Wallet sign-in was cancelled or failed. Please approve the sign-in message, then try again.");
  }

  async function confirmAndExecute() {
    if (!preview.canExecute || done || busy || confirming) return;
    setConfirming(true); setError(null);
    try {
      await ensureWalletServerSession();
      let confirmToken = preview.confirmToken;
      if (!confirmToken) {
        const issueResponse = await fetch("/api/ai/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "issue", preview }) });
        const issueData = await issueResponse.json().catch(() => ({}));
        if (!issueResponse.ok || !issueData?.confirmToken) throw new Error(issueData?.message || "The server could not authorize this transaction. Reconnect your wallet and try again.");
        confirmToken = String(issueData.confirmToken);
      }
      const response = await fetch("/api/ai/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmToken, preview }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Confirmation expired or no longer matches this transaction. Re-plan it and try again.");
      onExecute();
    } catch (e) { setError(e instanceof Error ? e.message : "Confirmation failed."); }
    finally { setConfirming(false); }
  }

  return (
    <div className="rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-blue-600/10 p-4 space-y-3 shadow-lg shadow-cyan-500/10">
      <div><div className="text-[11px] uppercase tracking-wider text-cyan-300 font-medium mb-1">Ready to sign · nothing sent yet</div><div className="font-semibold text-slate-50 text-base">{preview.title}</div>
        {preview.type === "bridge" && preview.fromChain && preview.toChain && <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-100">{String(preview.fromChain).includes("Arc") ? "Arc" : String(preview.fromChain).includes("Base") ? "Base" : preview.fromChain}<span className="text-cyan-400">→</span>{String(preview.toChain).includes("Arc") ? "Arc" : String(preview.toChain).includes("Base") ? "Base" : preview.toChain}</div>}
        <p className="text-sm text-slate-300 mt-1 leading-relaxed">{preview.summary}</p>
      </div>
      {preview.plan && preview.plan.length > 0 && <ol className="space-y-1.5">{preview.plan.map((step, i) => <li key={step.id} className="flex items-start gap-2 text-xs text-slate-300"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-[10px] font-mono text-cyan-300">{i + 1}</span><span>{step.label}{step.detail && <span className="text-slate-500"> · {step.detail}</span>}</span></li>)}</ol>}
      {preview.route && preview.route.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs"><Route className="h-3.5 w-3.5 text-cyan-400" />{preview.route.map((hop, i) => <span key={i} className="flex items-center gap-1.5">{i > 0 && <ArrowRight className="h-3 w-3 text-slate-600" />}<span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-slate-200">{hop}</span></span>)}</div>}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">{typeof preview.estimatedFeeUsd === "number" && <span className="inline-flex items-center gap-1"><Fuel className="h-3 w-3 text-amber-300" />~{formatUsdc(preview.estimatedFeeUsd)} est. gas (indicative)</span>}{preview.estimatedTime && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-emerald-300" />{preview.estimatedTime}</span>}{preview.fromChain && preview.toChain && <span>{CHAINS[preview.fromChain]?.short} → {CHAINS[preview.toChain]?.short}</span>}{preview.requiresWallet && <span className="inline-flex items-center gap-1 text-cyan-300/90"><Wallet className="h-3 w-3" />Rabby / MetaMask will pop up</span>}</div>
      <Button size="lg" className="w-full text-sm font-semibold h-11" disabled={!preview.canExecute || done || busy || confirming} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void confirmAndExecute(); }} type="button">
        {done ? <><Check className="h-4 w-4" />Executed</> : busy || confirming ? <><LiveSpinner />{confirming ? "Authorizing…" : "Waiting for wallet…"}</> : preview.canExecute ? cta : "Missing details"}
      </Button>
      {error && <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200">{error}</div>}
      <p className="text-[10px] text-center text-slate-500">The server authorizes this exact plan once, then the wallet can open.</p>
    </div>
  );
}
