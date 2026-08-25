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
import { Activity, ArrowRight, MessageSquare, Wrench, Download, Trash2, Bug, ExternalLink } from "lucide-react";
import { executeBridgeRecovery, executeSend } from "@/lib/client-actions";
import { Button } from "@/components/ui/button";
import { clearBridgeDebugEvents, downloadBridgeDebugLog, getBridgeDebugEvents } from "@/lib/bridge-debug";
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
  const [payRequest, setPayRequest] = useState<{ amount: string; to?: string; memo?: string } | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [debugCount, setDebugCount] = useState(0);

  useEffect(() => { if (walletAddress) { refreshBalances(); void loadServerTransactions(walletAddress); } }, [walletAddress, refreshBalances, loadServerTransactions]);
  useEffect(() => { setDebugCount(getBridgeDebugEvents().length); }, []);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search); const raw = sp.get("pay"); if (!raw) return;
      const q = new URLSearchParams(decodeURIComponent(raw)); const amount = q.get("amount") || "10"; const to = q.get("to") || undefined; const memo = q.get("memo") || "Payment request";
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
      addTransaction(tx); setActiveTx(tx.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bridge recovery failed.";
      addMessage({ id: `msg_bridge_retry_${Date.now()}`, role: "assistant", content: `**Bridge retry failed:** ${message}`, createdAt: new Date().toISOString() });
    } finally { setThinking(false); setDebugCount(getBridgeDebugEvents().length); }
  }

  async function fulfillPayRequest() { if (!payRequest || !walletAddress) return; const to = payRequest.to || walletAddress; if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return; setPayBusy(true); setThinking(true); try { const tx = await executeSend({ amount: payRequest.amount, token: "USDC", chain: "Arc_Testnet", recipient: to, recipientLabel: payRequest.memo || "Payment request", preferLive: true }); addTransaction(tx); setActiveTx(tx.id); setPayRequest(null); } catch (e) { addMessage({ id: `msg_payerr_${Date.now()}`, role: "assistant", content: `**Payment failed:** ${e instanceof Error ? e.message : "unknown"}`, createdAt: new Date().toISOString() }); setMobileTab("chat"); } finally { setPayBusy(false); setThinking(false); } }

  return (
    <main className="mx-auto w-full max-w-[1440px] overflow-x-clip bg-[#f7f9fc] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[#101828] sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <header className="mb-4 sm:mb-5">
        <div className="overflow-hidden rounded-[1.6rem] border border-[#dfe6ef] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-5 lg:p-7">
          <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
            <div className="flex items-start justify-between gap-3 sm:gap-6">
              <div className="min-w-0 max-w-3xl">
                <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#315bea] sm:text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-[#315bea]" />Command center</div>
                <h1 className="max-w-[18ch] text-[clamp(1.85rem,8.5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-[#0b1220] sm:max-w-none">Move money <span className="bg-gradient-to-r from-[#4f46e5] via-[#2563eb] to-[#06b6d4] bg-clip-text text-transparent">intelligently.</span></h1>
                <p className="mt-2.5 max-w-2xl text-[12px] leading-[1.55] text-[#5b687a] sm:mt-3 sm:text-[15px] sm:leading-6">One workspace for AI-assisted stablecoin operations across Arc and supported EVM networks.</p>
              </div>
              <Badge variant="outline" className="hidden shrink-0 items-center gap-1.5 border-[#d9e1ec] bg-[#f8fafc] px-2.5 py-1.5 text-[10px] text-[#315bea] sm:flex"><Activity className="h-3 w-3" />Testnet</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl border border-[#e1e7ef] bg-[#f8fafc] px-3.5 py-3.5 sm:px-5 sm:py-5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Available balance</p><p className="mt-1 truncate text-base font-semibold text-[#101828] sm:text-xl">{liveBalanceUsdc ? `${formatUsdc(Number(liveBalanceUsdc))} USDC` : "—"}</p></div>
              <div className="min-w-0 rounded-xl border border-[#e1e7ef] bg-[#f8fafc] px-3.5 py-3.5 sm:px-5 sm:py-5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Connected wallet</p><p className="mt-1 truncate text-[12px] font-semibold text-[#101828] sm:text-[14px]">{walletAddress ? shortenAddress(walletAddress) : "Not connected"}</p></div>
              <div className="col-span-2 min-w-0 rounded-xl border border-[#e1e7ef] bg-[#f8fafc] px-3.5 py-3.5 sm:col-span-1 sm:px-5 sm:py-5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Operations</p><p className="mt-1 text-base font-semibold text-[#101828] sm:text-xl">{transactions.length.toString().padStart(2, "0")} <span className="text-[10px] font-medium text-[#64748b] sm:text-xs">recorded</span></p></div>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2"><Bug className="h-4 w-4 shrink-0 text-amber-600" /><div className="min-w-0"><p className="text-xs font-semibold text-amber-900">Bridge Diagnostics</p><p className="truncate text-[10px] text-amber-800">Records SDK steps, chain IDs, tx hashes, errors and raw bridge responses. Secrets are redacted.</p></div></div>
              <div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" className="h-9 bg-white text-[10px]" onClick={() => downloadBridgeDebugLog()}><Download className="mr-1.5 h-3.5 w-3.5" />Export JSON ({debugCount})</Button><Button type="button" variant="outline" size="sm" className="h-9 bg-white text-[10px]" onClick={() => { clearBridgeDebugEvents(); setDebugCount(0); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Clear</Button></div>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#2563eb]/20 to-transparent" />
          </div>
        </div>
        {payRequest && <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-3 text-xs text-[#1e3a8a] sm:flex-row sm:items-center sm:justify-between sm:px-4"><span className="min-w-0 truncate">Pay request: <strong>{payRequest.amount} USDC</strong>{payRequest.to ? ` → ${payRequest.to.slice(0, 10)}…` : ""}</span><Button size="sm" className="h-10 w-full shrink-0 bg-gradient-to-r from-[#4f46e5] via-[#2563eb] to-[#06b6d4] text-white sm:w-auto" disabled={!walletAddress || payBusy} onClick={() => void fulfillPayRequest()}>{payBusy ? "Signing…" : "Pay request"}</Button></div>}
      </header>

      <div className="mb-3 grid grid-cols-2 rounded-2xl border border-[#e1e7ef] bg-white p-1 shadow-sm lg:hidden">
        <button onClick={() => setMobileTab("chat")} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition", mobileTab === "chat" ? "bg-[#eef2ff] text-[#315bea] ring-1 ring-[#c7d2fe]" : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#172033]")}><MessageSquare className="h-4 w-4" />AI Operator</button>
        <button onClick={() => setMobileTab("tools")} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition", mobileTab === "tools" ? "bg-[#f1f5f9] text-[#172033] ring-1 ring-[#dbe3ee]" : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#172033]")}><Wrench className="h-4 w-4" />Operate</button>
      </div>

      <section className="grid w-full min-w-0 gap-4 pb-2 sm:gap-5 lg:grid-cols-12">
        <div className={cn("min-w-0 w-full lg:col-span-7 xl:col-span-8", mobileTab !== "chat" && "hidden lg:block")}><div className="[&>div]:!h-[clamp(430px,calc(100dvh-330px),680px)] [&>div]:!min-h-[430px] sm:[&>div]:!h-full sm:[&>div]:!min-h-[520px]"><ChatPanel /></div></div>
        <div className={cn("min-w-0 w-full space-y-4 lg:col-span-5 xl:col-span-4", mobileTab !== "tools" && "hidden lg:block")}>
          <UserGuideCard />
          <div id="tools" className="min-w-0 w-full overflow-hidden"><ToolsWorkspace defaultTab="send" /></div>
          <LiveOperationPanel />
          {active && <TransactionProgress tx={active} onRetry={active.status === "error" || active.retryable ? () => void retryActive() : undefined} />}
          <Card className="w-full overflow-hidden border-[#e1e7ef] bg-white shadow-sm">
            <CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><CardTitle className="truncate text-sm text-[#172033]">Activity timeline</CardTitle><a href="#tools" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#315bea] hover:bg-[#eef2ff]">Operate <ArrowRight className="h-3 w-3" /></a></div></CardHeader>
            <CardContent className="space-y-3">
              {transactions.length === 0 && <p className="text-[12px] leading-relaxed text-[#64748b]">No operations yet. Start with a small Send, Swap or Bridge, or ask the AI Operator to prepare one for you.</p>}
              {transactions.slice(0, 8).map((tx) => {
                const isActive = active?.id === tx.id;
                const detail = getActivityDetail(tx);
                const isBridgeError = tx.type === "bridge" && (tx.status === "error" || tx.retryable);
                const childSteps = tx.type === "bridge" ? bridgeTxSteps(tx) : [];
                return (
                  <div key={tx.id} className={cn("rounded-xl border p-2.5", isActive ? "border-[#93c5fd] bg-[#eff6ff]" : "border-[#e5eaf0] bg-[#f8fafc]")}>
                    <button type="button" onClick={() => setActiveTx(tx.id)} className="flex min-w-0 w-full min-h-10 items-center justify-between gap-2 text-left text-sm">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="truncate capitalize font-medium text-[#172033]">{tx.type.replace("_", " ")} · {tx.amount} {tx.token}</div>
                        <div className="mt-0.5 truncate text-[11px] text-[#64748b]">{tx.status}{tx.recipient ? ` · ${shortenAddress(tx.recipient)}` : tx.toChain ? ` · ${tx.toChain.replace(/_/g, " ")}` : ""}</div>
                        {isBridgeError && detail && <div className="mt-1 truncate text-[10px] leading-4 text-red-500" title={detail}>{detail}</div>}
                      </div>
                      <Badge variant={tx.status === "success" ? "success" : tx.status === "error" ? "outline" : "cyan"} className="shrink-0 text-[9px]">{tx.status}</Badge>
                    </button>
                    {childSteps.length > 0 && (
                      <div className="mt-2 border-t border-[#e2e8f0] pt-2 space-y-1.5">
                        {childSteps.map((step, index) => {
                          const href = getStepExplorerUrl(tx, step);
                          return (
                            <div key={`${step.name}-${step.txHash}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/75 px-2.5 py-2">
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", step.state === "success" ? "bg-emerald-500" : step.state === "error" ? "bg-red-500" : "bg-amber-400")} />
                              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#334155]">{step.name}</span>
                              {href ? (
                                <a href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] text-[#315bea] hover:underline" title={step.txHash}>{shortenAddress(step.txHash || "", 3)}<ExternalLink className="h-2.5 w-2.5" /></a>
                              ) : step.txHash ? (
                                <span className="shrink-0 font-mono text-[9px] text-[#64748b]">{shortenAddress(step.txHash, 3)}</span>
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
    </main>
  );
}
