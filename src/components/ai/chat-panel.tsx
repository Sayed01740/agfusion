"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  CheckCircle2,
  Loader2,
  Terminal,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { uid } from "@/lib/utils";
import type { ActionPreview, ChatMessage } from "@/types";
import { ActionPreviewCard } from "@/components/ai/action-preview";
import {
  executeBridge,
  executeSend,
  executeSwap,
} from "@/lib/client-actions";
import { runAgentStream } from "@/lib/agent-client";
import { runUnifiedRouteFlow } from "@/blockchain/appkit-service";
import { requireSafeRecipient } from "@/lib/balances-empty";

const SUGGESTIONS = [
  "What can you do?",
  "Show my balances",
  "How do I send USDC?",
  "Swap 1 USDC to EURC",
  "Bridge 5 USDC from Arc to Base",
  "Help me get started",
];

function renderMarkdownish(text: string) {
  return text.split("\n").map((line, i) => {
    let html = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-white/10 px-1 py-0.5 text-[12px] font-mono">$1</code>',
      );
    if (line.startsWith("• ") || line.startsWith("- ")) {
      html = `<span class="text-cyan-400/80 mr-1">•</span>${html.slice(2)}`;
    }
    return (
      <p
        key={i}
        className="min-h-[1.1em] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
    );
  });
}

export function ChatPanel() {
  const {
    messages,
    isThinking,
    addMessage,
    setThinking,
    addTransaction,
    setActiveTx,
    markPreviewExecuted,
    walletAddress,
    walletChainId,
    liveBalanceUsdc,
    forceDemo,
  } = usePilotStore();
  const [input, setInput] = useState("");
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [liveTrace, setLiveTrace] = useState<
    Array<{ name: string; summary: string; ok: boolean }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, statusLine, liveTrace]);

  async function send(text: string, execute = false) {
    const content = text.trim();
    if (!content || isThinking || sendingRef.current) return;

    sendingRef.current = true;
    const userMsg: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInput("");
    setThinking(true);
    setStatusLine("Agent online…");
    setLiveTrace([]);

    const wallet = {
      address: walletAddress,
      chainId: walletChainId,
      liveBalanceUsdc,
      forceDemo,
    };

    try {
      let finalMsg: ChatMessage | undefined;
      let pendingPreview: ActionPreview | undefined;
      let lastContent = "";
      const trace: Array<{ name: string; summary: string; ok: boolean }> = [];
      let sawError = false;

      const result = await runAgentStream({
        message: content,
        execute,
        confirmed: execute, // confirm gate: only true after UI Confirm & execute
        wallet,
        handlers: {
          onStatus: (m) => setStatusLine(m),
          onTool: (name, summary, ok) => {
            trace.push({ name, summary: summary || "", ok });
            setLiveTrace([...trace]);
          },
          onConfirm: (preview) => {
            pendingPreview = preview;
          },
          onMessage: (text, preview) => {
            lastContent = text;
            if (preview) pendingPreview = preview;
          },
          onTransaction: (tx) => {
            // Prefer store write once in onDone; keep latest for fallback
            void tx;
          },
          onDone: (message, transaction) => {
            finalMsg = {
              ...message,
              content: message.content || lastContent,
              actionPreview: message.actionPreview || pendingPreview,
              toolTrace: trace.length ? trace : message.toolTrace,
            };
            if (transaction) {
              // Always surface activity — live preferred; allow demo in UI if live fails policy
              try {
                addTransaction(transaction);
                setActiveTx(transaction.id);
              } catch {
                /* store may reject demo in live-only mode */
              }
            }
          },
          onError: (err) => {
            sawError = true;
            addMessage({
              id: uid("msg"),
              role: "assistant",
              content: `**Agent error:** ${err}\n\nTip: Connect Rabby (or your wallet) first, then try again. For payments, confirm the plan before execute.`,
              createdAt: new Date().toISOString(),
            });
          },
        },
      });

      if (!finalMsg && result.message) {
        finalMsg = {
          ...result.message,
          actionPreview: result.message.actionPreview || pendingPreview,
          toolTrace: trace.length ? trace : result.message.toolTrace,
        };
        if (result.transaction) {
          try {
            addTransaction(result.transaction);
            setActiveTx(result.transaction.id);
          } catch {
            /* ignore */
          }
        }
      }

      if (finalMsg) {
        addMessage(finalMsg);
      } else if (!sawError) {
        addMessage({
          id: uid("msg"),
          role: "assistant",
          content:
            lastContent ||
            "I could not complete that request. Try: **Show my balances**, **Swap 1 USDC to EURC**, or **Bridge 5 USDC from Arc to Base**.",
          createdAt: new Date().toISOString(),
          toolTrace: trace,
          actionPreview: pendingPreview,
        });
      }
    } catch (e) {
      addMessage({
        id: uid("msg"),
        role: "assistant",
        content: `Agent failed: ${e instanceof Error ? e.message : "unknown error"}. Retry with a short command like **Show my balances**.`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setThinking(false);
      setStatusLine(null);
      setLiveTrace([]);
      sendingRef.current = false;
    }
  }

  /**
   * Run the planned action directly (do NOT re-chat).
   * Re-parsing "Swap 5 USDC…" often failed to open the wallet; execute* hits App Kit / viem.
   */
  async function executePreview(messageId: string, preview: ActionPreview) {
    if (preview.executed || !preview.canExecute || isThinking || sendingRef.current)
      return;

    if (!walletAddress && preview.requiresWallet !== false) {
      addMessage({
        id: uid("msg"),
        role: "assistant",
        content:
          "**Connect your wallet first** (Rabby recommended), switch to **Arc Testnet**, then press **Confirm & open wallet** again.",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    markPreviewExecuted(messageId);
    sendingRef.current = true;
    setThinking(true);
    setStatusLine(
      preview.type === "swap"
        ? "Opening swap — check Rabby for signature…"
        : "Opening wallet for signature…",
    );

    try {
      let tx;
      const amount = preview.amount || "10";

      if (preview.type === "swap") {
        tx = await executeSwap({
          amount,
          tokenIn: preview.token || "USDC",
          tokenOut: preview.tokenOut || "EURC",
          chain: "Arc_Testnet",
        });
      } else if (preview.type === "send") {
        const recipient = requireSafeRecipient(
          preview.recipient,
          preview.recipientLabel,
        );
        tx = await executeSend({
          amount,
          token: preview.token || "USDC",
          chain: "Arc_Testnet",
          recipient,
          recipientLabel: preview.recipientLabel,
          preferLive: true,
        });
      } else if (preview.type === "bridge") {
        tx = await executeBridge({
          amount,
          fromChain: preview.fromChain || "Arc_Testnet",
          toChain: preview.toChain || "Base_Sepolia",
          token: "USDC",
          preferLive: true,
        });
      } else if (preview.type === "route") {
        const recipient = requireSafeRecipient(
          preview.recipient,
          preview.recipientLabel,
        );
        tx = await runUnifiedRouteFlow({
          amount,
          token: "USDC",
          fromChain: preview.fromChain || "Base_Sepolia",
          recipient,
          recipientLabel: preview.recipientLabel,
        });
      } else {
        throw new Error(`Unsupported action type: ${preview.type}`);
      }

      addTransaction(tx);
      setActiveTx(tx.id);
      addMessage({
        id: uid("msg"),
        role: "assistant",
        content: [
          tx.status === "success"
            ? `✅ **${preview.title} completed**`
            : `**${preview.title}** status: ${tx.status}`,
          "",
          `${tx.amount} ${tx.token}${tx.tokenOut ? ` → ${tx.tokenOut}` : ""}`,
          tx.txHash ? `Tx: \`${tx.txHash}\`` : "",
          tx.explorerUrl ? `Explorer: ${tx.explorerUrl}` : "",
          tx.message || "",
        ]
          .filter(Boolean)
          .join("\n"),
        createdAt: new Date().toISOString(),
        transactionId: tx.id,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addMessage({
        id: uid("msg"),
        role: "assistant",
        content: [
          `**Could not complete ${preview.title}**`,
          "",
          err,
          "",
          preview.type === "swap"
            ? "Swap needs: valid kit key (Save key in Stablecoin FX) · Rabby on Arc · USDC balance from faucet.circle.com"
            : "Check wallet connection, Arc Testnet, and funds.",
        ].join("\n"),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setThinking(false);
      setStatusLine(null);
      sendingRef.current = false;
    }
  }

  return (
    <div className="flex h-full min-h-[520px] max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-cyan-400/12 bg-gradient-to-b from-[#0c1628]/95 to-[#060d18] shadow-2xl shadow-black/40 glow-border">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-cyan-500/[0.06] to-transparent px-4 py-3.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl ring-1 ring-cyan-400/25 shadow-md shadow-cyan-500/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-180.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-cover"
            />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">AGFusion Agent</div>
            <div className="text-[11px] text-slate-500">
              Plan · confirm · wallet sign
            </div>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 font-medium">
          <Terminal className="h-3 w-3" />
          Live tools
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[90%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 px-4 py-3 text-sm"
                    : "max-w-[95%] rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/5 px-4 py-3 text-sm space-y-3"
                }
              >
                <div className="text-slate-100">{renderMarkdownish(m.content)}</div>

                {m.toolTrace && m.toolTrace.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5 space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {m.toolTrace.length} tool step
                      {m.toolTrace.length === 1 ? "" : "s"}
                    </div>
                    {m.toolTrace.slice(0, 6).map((t, i) => (
                      <div
                        key={`${t.name}-${i}`}
                        className={`text-[11px] font-mono ${
                          t.ok ? "text-slate-400" : "text-red-300/90"
                        }`}
                      >
                        {t.ok ? "✓" : "✗"} {t.name}
                        {t.summary ? ` — ${t.summary.slice(0, 80)}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {m.codeBlocks?.map((block, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-white/10 bg-slate-950"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-[11px] text-slate-400">
                      <span>{block.filename || block.language}</span>
                      <span className="uppercase tracking-wider">
                        {block.language}
                      </span>
                    </div>
                    <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-cyan-100/90 font-mono">
                      <code>{block.code}</code>
                    </pre>
                  </div>
                ))}

                {m.actionPreview && (
                  <ActionPreviewCard
                    preview={m.actionPreview}
                    busy={isThinking}
                    onExecute={() => executePreview(m.id, m.actionPreview!)}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2 px-1"
          >
            <div className="flex items-center gap-2 text-sm text-cyan-300/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusLine || "Agent working…"}
            </div>
            {liveTrace.length > 0 && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-slate-400">
                Running secure agent tools… ({liveTrace.length})
              </div>
            )}
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/5 p-3 space-y-3 shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isThinking}
              onClick={() => send(s)}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200 transition disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              disabled={isThinking}
              placeholder='Try: "Show my balances" or "How do I send USDC?"'
              className="w-full resize-none rounded-2xl border border-white/[0.1] bg-[#040a14]/85 px-4 py-3 pr-12 text-sm leading-relaxed text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/35 focus:ring-2 focus:ring-cyan-400/25 disabled:opacity-60"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isThinking}
            className="h-11 w-11 shrink-0 rounded-2xl"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 px-1">
          <Zap className="h-3 w-3 text-cyan-500" />
          Live only · tools first · Confirm · wallet signature required
        </div>
      </div>
    </div>
  );
}
