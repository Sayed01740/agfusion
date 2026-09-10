"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ai/chat-panel";
import { ToolsWorkspace } from "@/components/panels/tools-workspace";
import { TransactionProgress } from "@/components/tx/transaction-progress";
import { LiveOperationPanel } from "@/components/tx/live-operation-panel";
import { UserGuideCard } from "@/components/onboarding/user-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { cn, shortenAddress } from "@/lib/utils";
import { formatUsdc } from "@/lib/fees";
import { Activity, ArrowRight, MessageSquare, Wrench, ExternalLink } from "lucide-react";
import { executeBridgeRecovery, executeSend } from "@/lib/client-actions";
import { Button } from "@/components/ui/button";
import type { TransactionRecord, TxStep } from "@/types";

function getActivityError(tx: TransactionRecord): { step?: string; message?: string } {
  const failedStep = tx.steps?.find((step) => step.state === "error");
  if (failedStep?.message) return { step: failedStep.name, message: failedStep.message };
  if (tx.message) {
    const parts = tx.message.split(" · ").filter(Boolean);
    const meaningful = parts.find((part) => /error|failed|insufficient|revert|reject|cancel|cannot|could not|not confirmed|retry/i.test(part));
    return { message: meaningful || parts[parts.length - 1] };
  }
  return {};
}
function getActivityDetail(tx: TransactionRecord): string | null {
  const error = getActivityError(tx);
  if (error.step && error.message) return `${error.step}: ${error.message}`;
  if (error.message) return error.message;
  if (tx.status === "error") return "Bridge failed. Select this operation to view the full error and retry.";
  if (tx.retryable) return "Bridge is not confirmed yet. Select this operation to check again.";
  return null;
}

function getBridgeStepChain(tx: TransactionRecord, step: TxStep): string | undefined {
  const name = step.name.toLowerCase();
  if (name.includes("mint") || name.includes("receive") || name.includes("destination")) return tx.toChain;
  return tx.fromChain;
}

function getStepExplorerUrl(tx: TransactionRecord, step: TxStep): string | null {
  if (!step.txHash) return null;
  const chain = tx.type === "bridge" ? getBridgeStepChain(tx, step) : tx.fromChain || tx.toChain;
  const explorer = chain === "Arc_Testnet"
    ? "https://testnet.arcscan.app"
    : chain === "Base_Sepolia"
      ? "https://sepolia.basescan.org"
      : undefined;
  return explorer ? `${explorer}/tx/${step.txHash}` : null;
}

function bridgeTxSteps(tx: TransactionRecord): TxStep[] {
  return (tx.steps || []).filter((step) => Boolean(step.txHash));
}

export default function DashboardPage() {
  const { transactions, activeTxId, setActiveTx, addTransaction, setThinking, walletAddress, refreshBalances, loadServerTransactions, addMessage, liveBalanceUsdc } = usePilotStore();
  const active = transactions.find((t) => t.id === activeTxId) || transactions[0];
  const [mobileTab, setMobileTab] = useState<"chat" | "tools">("chat");
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<"guide" | "tools" | null>(null);
  const [payRequest, setPayRequest] = useState<{ amount: string; to?: string; memo?: string } | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => { if (walletAddress) { refreshBalances(); void loadServerTransactions(walletAddress); } }, [walletAddress, refreshBalances, loadServerTransactions]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search); const raw = sp.get("pay"); if (!raw) return;
      const q = new URLSearchParams(decodeURIComponent(raw)); const amount = q.get("amount") || "10"; const to = q.get("to") || undefined; const memo = q.get("memo") || "Payment request";
      setPayRequest({ amount, to, memo });
      addMessage({ id: `msg_pay_${Date.now()}`, role: "assistant", content: `**Payment request**\n\n• Amount: **${amount} USDC**\n• To: \`${to || "your wallet / enter address"}\`\n• Memo: ${memo}\n\nConnect wallet and press **Pay request** below, or use **Tools → More → QR**.`, createdAt: new Date().toISOString() });
      setMobileTab("tools");
    } catch { /* ignore */ }
  }, [addMessage]);

  useEffect(() => {
    function revealTarget(hash: string) {
      if (hash !== "#guide" && hash !== "#tools") return;
      setMobileTab("tools");
      if (hash === "#guide") setGuideOpen(true);
      setPendingTarget(hash === "#guide" ? "guide" : "tools");
    }
    function onHashChange() { revealTarget(window.location.hash); }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) revealTarget(url.hash);
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    // Capture also handles repeated hashes before Next Link intercepts navigation.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!pendingTarget || mobileTab !== "tools" || (pendingTarget === "guide" && !guideOpen)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(pendingTarget);
      if (!target?.getClientRects().length) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      setPendingTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingTarget, mobileTab, guideOpen]);

  async function retryActive() {
    if (!active?.fromChain || !active.toChain) return;
    setThinking(true);
    try {
      const tx = await executeBridgeRecovery({ amount: active.amount || "0", fromChain: active.fromChain, toChain: active.toChain, token: active.token || "USDC", recipient: active.recipient, failedTx: active, txId: active.id });
      addTransaction(tx); setActiveTx(tx.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bridge recovery failed.";
      addMessage({ id: `msg_bridge_retry_${Date.now()}`, role: "assistant", content: `**Bridge retry failed:** ${message}`, createdAt: new Date().toISOString() });
    } finally { setThinking(false); }
  }

  async function fulfillPayRequest() { if (!payRequest || !walletAddress) return; const to = payRequest.to || walletAddress; if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return; setPayBusy(true); setThinking(true); try { const tx = await executeSend({ amount: payRequest.amount, token: "USDC", chain: "Arc_Testnet", recipient: to, recipientLabel: payRequest.memo || "Payment request", preferLive: true }); addTransaction(tx); setActiveTx(tx.id); setPayRequest(null); } catch (e) { addMessage({ id: `msg_payerr_${Date.now()}`, role: "assistant", content: `**Payment failed:** ${e instanceof Error ? e.message : "unknown"}`, createdAt: new Date().toISOString() }); setMobileTab("chat"); } finally { setPayBusy(false); setThinking(false); } }

  return (
    <div className="mx-auto w-full max-w-[1440px] overflow-x-clip bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-foreground sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <header className="mb-5 sm:mb-6">
        <div className="overflow-hidden rounded-3xl border border-border glass-cockpit p-5 sm:p-6 lg:p-8 relative shadow-2xl">
          {/* Subtle ambient lighting inside card */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-[80px]" />
          
          <div className="flex min-w-0 flex-col gap-6 sm:gap-7 relative z-[1]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0 max-w-3xl">
                <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  Arc Network Workspace
                </div>
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  Move money <span className="text-gradient">intelligently.</span>
                </h1>
                <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  AI-assisted crosschain operations on Arc with USDC gas and fast finality.
                </p>
              </div>

              {/* Status Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="items-center gap-1.5 border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                  Fast Finality
                </Badge>
                <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 border-border bg-muted/80 px-3 py-1 text-xs text-muted-foreground font-mono">
                  <Activity aria-hidden="true" className="h-3 w-3 text-accent" />
                  Arc Testnet
                </Badge>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="group min-w-0 rounded-2xl border border-border bg-card/90 p-4 sm:p-5 transition-all duration-200 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Available Balance</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/60 group-hover:bg-accent transition-colors" />
                </p>
                <p className="mt-2 break-words text-lg font-bold text-foreground sm:text-2xl font-display tabular-nums">
                  {liveBalanceUsdc ? `${formatUsdc(Number(liveBalanceUsdc))} ` : "0.00 "}
                  <span className="text-xs sm:text-sm font-semibold text-accent">USDC</span>
                </p>
              </div>

              <div className="group min-w-0 rounded-2xl border border-border bg-card/90 p-4 sm:p-5 transition-all duration-200 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Connected Account</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </p>
                <p className="mt-2 break-words font-mono text-sm sm:text-base font-semibold text-foreground">
                  {walletAddress ? shortenAddress(walletAddress, 4) : "Not connected"}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1 group min-w-0 rounded-2xl border border-border bg-card/90 p-4 sm:p-5 transition-all duration-200 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Recent Activity</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                </p>
                <p className="mt-2 text-lg font-bold text-foreground sm:text-2xl font-display tabular-nums">
                  {transactions.length.toString().padStart(2, "0")}{" "}
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Transactions</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {payRequest && (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent/10 p-3.5 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="min-w-0 truncate font-medium">
              Payment Request: <strong className="font-semibold text-accent">{payRequest.amount} USDC</strong>
              {payRequest.to ? <span className="text-muted-foreground font-mono ml-1">→ {shortenAddress(payRequest.to, 4)}</span> : ""}
            </span>
            <Button size="sm" className="h-9 w-full shrink-0 sm:w-auto font-semibold" disabled={!walletAddress || payBusy} onClick={() => void fulfillPayRequest()}>
              {payBusy ? "Signing…" : "Pay Request"}
            </Button>
          </div>
        )}
      </header>

      <div role="group" aria-label="Dashboard view" className="mb-4 grid grid-cols-2 rounded-2xl border border-border bg-card/80 p-1.5 shadow-lg backdrop-blur-xl lg:hidden">
        <button
          type="button"
          aria-pressed={mobileTab === "chat"}
          aria-controls="dashboard-chat"
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent",
            mobileTab === "chat"
              ? "bg-accent/15 text-accent border border-accent/30 shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <MessageSquare aria-hidden="true" className="h-4 w-4" />
          AI Operator
        </button>
        <button
          type="button"
          aria-pressed={mobileTab === "tools"}
          aria-controls="dashboard-tools"
          onClick={() => setMobileTab("tools")}
          className={cn(
            "flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent",
            mobileTab === "tools"
              ? "bg-accent/15 text-accent border border-accent/30 shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Wrench aria-hidden="true" className="h-4 w-4" />
          Operate
        </button>
      </div>


      <section className="grid w-full min-w-0 gap-4 pb-2 sm:gap-5 lg:grid-cols-12">
        <div id="dashboard-chat" className={cn("min-w-0 w-full lg:col-span-7 xl:col-span-8", mobileTab !== "chat" && "hidden lg:block")}><div className="[&>div]:!h-[clamp(430px,calc(100dvh-330px),680px)] [&>div]:!min-h-[430px] sm:[&>div]:!h-full sm:[&>div]:!min-h-[520px]"><ChatPanel /></div></div>
        <div id="dashboard-tools" className={cn("min-w-0 w-full space-y-4 lg:col-span-5 xl:col-span-4", mobileTab !== "tools" && "hidden lg:block")}>
          <UserGuideCard open={guideOpen} onOpenChange={setGuideOpen} />
          <div className="min-w-0 w-full overflow-hidden"><ToolsWorkspace defaultTab="send" /></div>
          <LiveOperationPanel />
          {active && <TransactionProgress tx={active} onRetry={active.status === "error" || active.retryable ? () => void retryActive() : undefined} />}
          <Card className="w-full overflow-hidden border-border bg-card shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="truncate text-sm font-semibold text-foreground">Activity timeline</CardTitle>
                <a href="#tools" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-muted transition-colors">
                  Operate <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {transactions.length === 0 && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  No operations yet. Start with a small Send, Swap or Bridge, or ask the AI Operator to prepare one for you.
                </p>
              )}
              {transactions.slice(0, 8).map((tx) => {
                const isActive = active?.id === tx.id;
                const detail = getActivityDetail(tx);
                const isBridgeError = tx.type === "bridge" && (tx.status === "error" || tx.retryable);
                const childSteps = tx.type === "bridge" ? bridgeTxSteps(tx) : [];
                return (
                  <div
                    key={tx.id}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      isActive
                        ? "border-accent/40 bg-accent/5 shadow-sm"
                        : "border-border bg-muted/60 hover:bg-muted"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTx(tx.id)}
                      className="flex min-w-0 w-full min-h-10 items-center justify-between gap-2 text-left text-sm"
                    >
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="truncate capitalize font-semibold text-foreground">
                          {tx.type.replace("_", " ")} · {tx.amount} {tx.token}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {tx.status}
                          {tx.recipient ? ` · ${shortenAddress(tx.recipient)}` : tx.toChain ? ` · ${tx.toChain.replace(/_/g, " ")}` : ""}
                        </div>
                        {isBridgeError && detail && (
                          <div className="mt-1 truncate text-[10px] leading-4 text-red-400" title={detail}>
                            {detail}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={tx.status === "success" ? "success" : tx.status === "error" ? "danger" : "cyan"}
                        className="shrink-0 text-[10px] font-mono"
                      >
                        {tx.status}
                      </Badge>
                    </button>
                    {childSteps.length > 0 && (
                      <div className="mt-2.5 border-t border-border/80 pt-2 space-y-1.5">
                        {childSteps.map((step, index) => {
                          const href = getStepExplorerUrl(tx, step);
                          return (
                            <div
                              key={`${step.name}-${step.txHash}-${index}`}
                              className="flex min-w-0 items-center gap-2 rounded-lg bg-card/80 border border-border/50 px-2.5 py-1.5"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  step.state === "success" ? "bg-emerald-400" : step.state === "error" ? "bg-red-400" : "bg-amber-400"
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-muted-foreground">
                                {step.name}
                              </span>
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-accent hover:underline"
                                  title={step.txHash}
                                >
                                  {shortenAddress(step.txHash || "", 3)}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ) : step.txHash ? (
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                  {shortenAddress(step.txHash, 3)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
}
