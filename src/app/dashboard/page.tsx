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
import {
  Activity,
  ArrowRight,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { executeBridgeRecovery, executeSend } from "@/lib/client-actions";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const {
    transactions,
    activeTxId,
    setActiveTx,
    addTransaction,
    setThinking,
    walletAddress,
    refreshBalances,
    loadServerTransactions,
    addMessage,
    liveBalanceUsdc,
  } = usePilotStore();
  const active =
    transactions.find((t) => t.id === activeTxId) || transactions[0];
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
      addMessage({
        id: `msg_pay_${Date.now()}`,
        role: "assistant",
        content: `**Payment request**\n\n• Amount: **${amount} USDC**\n• To: \`${to || "your wallet / enter address"}\`\n• Memo: ${memo}\n\nConnect wallet and press **Pay request** below, or use **Tools → More → QR**.`,
        createdAt: new Date().toISOString(),
      });
      setMobileTab("tools"); // Switch to tools if pay request is loaded
    } catch {
      /* ignore */
    }
  }, [addMessage]);

  async function retryActive() {
    setThinking(true);
    try {
      const tx = await executeBridgeRecovery({
        amount: active?.amount || "50",
        fromChain: active?.fromChain || "Base_Sepolia",
        toChain: active?.toChain || "Arc_Testnet",
      });
      addTransaction(tx);
      setActiveTx(tx.id);
    } finally {
      setThinking(false);
    }
  }

  async function fulfillPayRequest() {
    if (!payRequest || !walletAddress) return;
    const to = payRequest.to || walletAddress;
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return;
    setPayBusy(true);
    setThinking(true);
    try {
      const tx = await executeSend({
        amount: payRequest.amount,
        token: "USDC",
        chain: "Arc_Testnet",
        recipient: to,
        recipientLabel: payRequest.memo || "Payment request",
        preferLive: true,
      });
      addTransaction(tx);
      setActiveTx(tx.id);
      setPayRequest(null);
    } catch (e) {
      addMessage({
        id: `msg_payerr_${Date.now()}`,
        role: "assistant",
        content: `**Payment failed:** ${e instanceof Error ? e.message : "unknown"}`,
        createdAt: new Date().toISOString(),
      });
      setMobileTab("chat"); // Switch to chat to show error
    } finally {
      setPayBusy(false);
      setThinking(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl sm:px-6 sm:py-8 pb-4">
      {/* Page intro */}
      <header className="mb-4 sm:mb-6 animate-fade-up px-4 sm:px-0 pt-4 sm:pt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl hidden sm:block">
            <p className="section-label mb-1.5">Dashboard</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              Your Arc <span className="text-gradient">money workspace</span>
            </h1>
            <p className="prose-app mt-2.5 max-w-xl text-sm">
              Two ways to work: <strong>chat with the agent</strong> (left) or
              use <strong>Send / Swap / Bridge</strong> forms (right). Testnet
              only — nothing leaves your wallet until you confirm.
            </p>
          </div>
          
          <div className="flex sm:hidden flex-col gap-1 w-full">
            <h1 className="font-display text-xl font-semibold text-slate-50">Workspace</h1>
            <p className="text-xs text-slate-400">Manage your Arc assets</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <Badge variant="cyan" className="gap-1 hidden xs:inline-flex">
              <Activity className="h-3 w-3" />
              Arc
            </Badge>
            {walletAddress && (
              <Badge variant="outline" className="font-mono text-[11px] bg-slate-900/50">
                {shortenAddress(walletAddress)}
                {liveBalanceUsdc != null && liveBalanceUsdc !== ""
                  ? ` · ${formatUsdc(Number(liveBalanceUsdc))} USDC`
                  : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Layout map — visible on desktop, simple */}
        <div className="mt-5 hidden sm:grid gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-slate-900/50 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/20">
              <MessageSquare className="h-4 w-4 text-cyan-300" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-slate-100">
                Left · AI agent
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Type in plain English. Best for plans and questions.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-slate-900/50 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-400/20">
              <Wrench className="h-4 w-4 text-blue-300" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-slate-100">
                Right · Money tools
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Tabs: <strong className="text-slate-400">Send</strong>,{" "}
                <strong className="text-slate-400">Swap</strong>,{" "}
                <strong className="text-slate-400">Bridge</strong>,{" "}
                <strong className="text-slate-400">More</strong>.
              </p>
            </div>
          </div>
        </div>

        {payRequest && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
            <span>
              Pay request: <strong>{payRequest.amount} USDC</strong>
              {payRequest.to ? ` → ${payRequest.to.slice(0, 10)}…` : ""}
            </span>
            <Button
              size="sm"
              className="h-7"
              disabled={!walletAddress || payBusy}
              onClick={() => void fulfillPayRequest()}
            >
              {payBusy ? "Signing…" : "Pay request (live)"}
            </Button>
          </div>
        )}
      </header>

      {/* Mobile Tab Switcher */}
      <div className="px-4 sm:px-0">
        <div className="flex p-1 mb-4 sm:mb-6 rounded-xl bg-slate-900/60 ring-1 ring-white/10 lg:hidden">
          <button
            onClick={() => setMobileTab("chat")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300",
              mobileTab === "chat"
                ? "bg-gradient-to-b from-cyan-400/20 to-teal-500/10 text-cyan-50 shadow-sm ring-1 ring-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            )}
          >
            <MessageSquare className={cn("w-4 h-4", mobileTab === "chat" ? "text-cyan-300" : "text-slate-500")} />
            AI Agent
          </button>
          <button
            onClick={() => setMobileTab("tools")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300",
              mobileTab === "tools"
                ? "bg-gradient-to-b from-blue-500/20 to-indigo-500/10 text-blue-50 shadow-sm ring-1 ring-blue-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            )}
          >
            <Wrench className={cn("w-4 h-4", mobileTab === "tools" ? "text-blue-300" : "text-slate-500")} />
            Money Tools
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:gap-5 lg:grid-cols-12">
        {/* LEFT: chat only — do not redesign */}
        <div className={cn(
          "lg:min-h-[560px] lg:col-span-7 xl:col-span-8 animate-fade-up",
          mobileTab !== "chat" && "hidden lg:block"
        )}>
          <ChatPanel />
        </div>

        {/* RIGHT: clear tools stack */}
        <div className={cn(
          "space-y-4 lg:col-span-5 xl:col-span-4 animate-fade-up px-4 sm:px-0",
          mobileTab !== "tools" && "hidden lg:block"
        )}>

          <UserGuideCard />

          <ToolsWorkspace defaultTab="send" />

          {active && (
            <TransactionProgress
              tx={active}
              onRetry={
                active.status === "error" || active.retryable
                  ? () => void retryActive()
                  : undefined
              }
            />
          )}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent activity</CardTitle>
                <a
                  href="#tools"
                  className="inline-flex items-center gap-1 text-[11px] text-cyan-400/90 hover:text-cyan-300"
                >
                  Open tools
                  <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {transactions.length === 0 && (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  No transactions yet. Try{" "}
                  <strong className="text-slate-400">Send</strong> with a small
                  amount, or ask the agent: “Swap 1 USDC to EURC”.
                </p>
              )}
              {transactions.slice(0, 8).map((tx) => {
                const isActive = active?.id === tx.id;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setActiveTx(tx.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      isActive
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-white/5 bg-white/[0.02] hover:border-white/15",
                    )}
                  >
                    <div>
                      <div className="capitalize text-slate-200">
                        {tx.type.replace("_", " ")} · {tx.amount} {tx.token}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {tx.status}
                        {tx.recipient
                          ? ` · ${shortenAddress(tx.recipient)}`
                          : tx.toChain
                            ? ` · ${tx.toChain.replace(/_/g, " ")}`
                            : ""}
                      </div>
                    </div>
                    <Badge
                      variant={
                        tx.status === "success"
                          ? "success"
                          : tx.status === "error"
                            ? "outline"
                            : "cyan"
                      }
                      className="shrink-0 text-[10px]"
                    >
                      {tx.status}
                    </Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
