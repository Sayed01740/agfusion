"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ai/chat-panel";
import { ToolsWorkspace } from "@/components/panels/tools-workspace";
import { TransactionProgress } from "@/components/tx/transaction-progress";
import { UserGuideCard } from "@/components/onboarding/user-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { cn, shortenAddress } from "@/lib/utils";
import { formatUsdc } from "@/lib/fees";
import { Activity, ArrowRight, MessageSquare, Wrench } from "lucide-react";
import { executeBridgeRecovery, executeSend } from "@/lib/client-actions";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { transactions, activeTxId, setActiveTx, addTransaction, setThinking, walletAddress, refreshBalances, loadServerTransactions, addMessage, liveBalanceUsdc } = usePilotStore();
  const active = transactions.find((t) => t.id === activeTxId) || transactions[0];
  const [mobileTab, setMobileTab] = useState<"chat" | "tools">("chat");
  const [payRequest, setPayRequest] = useState<{ amount: string; to?: string; memo?: string } | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (walletAddress) {
      refreshBalances();
      void loadServerTransactions(walletAddress);
    }
  }, [walletAddress, refreshBalances, loadServerTransactions]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("pay");
      if (!raw) return;
      const q = new URLSearchParams(decodeURIComponent(raw));
      const amount = q.get("amount") || "10";
      const to = q.get("to") || undefined;
      const memo = q.get("memo") || "Payment request";
      setPayRequest({ amount, to, memo });
      addMessage({ id: `msg_pay_${Date.now()}`, role: "assistant", content: `**Payment request**\n\n• Amount: **${amount} USDC**\n• To: \`${to || "your wallet / enter address"}\`\n• Memo: ${memo}\n\nConnect wallet and press **Pay request** below, or use **Tools → More → QR**.`, createdAt: new Date().toISOString() });
      setMobileTab("tools");
    } catch { /* ignore */ }
  }, [addMessage]);

  async function retryActive() {
    if (!active?.fromChain || !active.toChain) return;
    setThinking(true);
    try {
      const tx = await executeBridgeRecovery({ amount: active.amount || "0", fromChain: active.fromChain, toChain: active.toChain, token: active.token || "USDC", recipient: active.recipient, failedTx: active, txId: active.id });
      addTransaction(tx);
      setActiveTx(tx.id);
    } finally { setThinking(false); }
  }

  async function fulfillPayRequest() {
    if (!payRequest || !walletAddress) return;
    const to = payRequest.to || walletAddress;
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return;
    setPayBusy(true); setThinking(true);
    try {
      const tx = await executeSend({ amount: payRequest.amount, token: "USDC", chain: "Arc_Testnet", recipient: to, recipientLabel: payRequest.memo || "Payment request", preferLive: true });
      addTransaction(tx); setActiveTx(tx.id); setPayRequest(null);
    } catch (e) {
      addMessage({ id: `msg_payerr_${Date.now()}`, role: "assistant", content: `**Payment failed:** ${e instanceof Error ? e.message : "unknown"}`, createdAt: new Date().toISOString() });
      setMobileTab("chat");
    } finally { setPayBusy(false); setThinking(false); }
  }

  return (
    <main className="ag-premium-shell mx-auto w-full max-w-[1440px] overflow-x-clip pb-6 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <header className="mb-5 px-3 pt-3 sm:px-0 sm:pt-0">
        <div className="ag-command-hero overflow-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">
          <div className="relative z-10 flex min-w-0 flex-col gap-6 lg:gap-8">
            <div className="flex min-w-0 items-start justify-between gap-4 sm:gap-6">
              <div className="min-w-0 max-w-3xl">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/75 sm:text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.6)]" />
                  Command center
                </div>
                <h1 className="ag-hero-title text-[clamp(2rem,6vw,4.6rem)] leading-[0.98]">Move money <em>intelligently.</em></h1>
                <p className="mt-3 max-w-2xl text-[13px] leading-5 text-slate-400 sm:text-[15px] sm:leading-6">One workspace for AI-assisted stablecoin operations across Arc and supported EVM networks.</p>
              </div>
              <Badge variant="cyan" className="hidden shrink-0 items-center gap-1.5 border-cyan-400/15 bg-cyan-400/[0.05] px-2.5 py-1.5 text-[10px] sm:flex">
                <Activity className="h-3 w-3" /> Testnet
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-3">
              <div className="bg-black/10 px-4 py-4 sm:px-5 sm:py-5">
                <p className="ag-metric-label">Available balance</p>
                <p className="ag-metric-value mt-1 truncate text-lg sm:text-xl">{liveBalanceUsdc ? `${formatUsdc(Number(liveBalanceUsdc))} USDC` : "—"}</p>
              </div>
              <div className="bg-black/10 px-4 py-4 sm:px-5 sm:py-5">
                <p className="ag-metric-label">Connected wallet</p>
                <p className="ag-metric-value mt-1 truncate text-[13px] sm:text-[14px]">{walletAddress ? shortenAddress(walletAddress) : "Not connected"}</p>
              </div>
              <div className="bg-black/10 px-4 py-4 sm:px-5 sm:py-5">
                <p className="ag-metric-label">Operations</p>
                <p className="ag-metric-value mt-1 text-lg sm:text-xl">{transactions.length.toString().padStart(2, "0")} <span className="text-xs font-medium text-slate-500">recorded</span></p>
              </div>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" aria-hidden="true" />
          </div>
        </div>

        {payRequest && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.045] p-3 text-xs text-cyan-50 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <span className="min-w-0 truncate">Pay request: <strong>{payRequest.amount} USDC</strong>{payRequest.to ? ` → ${payRequest.to.slice(0, 10)}…` : ""}</span>
            <Button size="sm" className="h-9 w-full sm:w-auto" disabled={!walletAddress || payBusy} onClick={() => void fulfillPayRequest()}>{payBusy ? "Signing…" : "Pay request"}</Button>
          </div>
        )}
      </header>

      <div className="px-3 sm:px-0">
        <div className="mb-4 grid grid-cols-2 rounded-2xl border border-white/[0.07] bg-white/[0.018] p-1 lg:hidden">
          <button onClick={() => setMobileTab("chat")} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition", mobileTab === "chat" ? "bg-cyan-400/[0.08] text-cyan-50 ring-1 ring-cyan-400/20" : "text-slate-500 hover:text-slate-200")}>
            <MessageSquare className={cn("h-4 w-4", mobileTab === "chat" ? "text-cyan-300" : "text-slate-500")} /> AI Operator
          </button>
          <button onClick={() => setMobileTab("tools")} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition", mobileTab === "tools" ? "bg-white/[0.06] text-slate-50 ring-1 ring-white/10" : "text-slate-500 hover:text-slate-200")}>
            <Wrench className={cn("h-4 w-4", mobileTab === "tools" ? "text-slate-200" : "text-slate-500")} /> Operate
          </button>
        </div>
      </div>

      <section className="grid w-full min-w-0 gap-4 px-3 sm:gap-5 sm:px-0 lg:grid-cols-12">
        <div className={cn("min-w-0 w-full lg:col-span-7 xl:col-span-8", mobileTab !== "chat" && "hidden lg:block")}>
          <ChatPanel />
        </div>

        <div className={cn("min-w-0 space-y-4 lg:col-span-5 xl:col-span-4", mobileTab !== "tools" && "hidden lg:block")}>
          <UserGuideCard />
          <div id="tools" className="min-w-0"><ToolsWorkspace defaultTab="send" /></div>

          {active && <TransactionProgress tx={active} onRetry={active.status === "error" || active.retryable ? () => void retryActive() : undefined} />}

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">Activity timeline</CardTitle>
                <a href="#tools" className="inline-flex shrink-0 items-center gap-1 text-[11px] text-cyan-400/90 hover:text-cyan-300">Operate <ArrowRight className="h-3 w-3" /></a>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {transactions.length === 0 && <p className="text-[12px] leading-relaxed text-slate-500">No operations yet. Start with a small Send, Swap or Bridge, or ask the AI Operator to prepare one for you.</p>}
              {transactions.slice(0, 8).map((tx) => {
                const isActive = active?.id === tx.id;
                return (
                  <button key={tx.id} type="button" onClick={() => setActiveTx(tx.id)} className={cn("flex min-w-0 w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition", isActive ? "border-cyan-500/30 bg-cyan-500/[0.06]" : "border-white/[0.05] bg-white/[0.018] hover:border-white/10")}>
                    <div className="min-w-0">
                      <div className="truncate capitalize text-slate-200">{tx.type.replace("_", " ")} · {tx.amount} {tx.token}</div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">{tx.status}{tx.recipient ? ` · ${shortenAddress(tx.recipient)}` : tx.toChain ? ` · ${tx.toChain.replace(/_/g, " ")}` : ""}</div>
                    </div>
                    <Badge variant={tx.status === "success" ? "success" : tx.status === "error" ? "outline" : "cyan"} className="shrink-0 text-[10px]">{tx.status}</Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
