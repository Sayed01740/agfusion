"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  Bot,
  ChevronDown,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const USE_CASES = [
  {
    title: "Send money (USDC)",
    plain: "Pay a friend or another wallet on Arc — like a bank transfer, but on-chain.",
    where: "Right → Money tools → Send tab",
    try: "Paste a full 0x address · amount 0.05 · Confirm · sign in wallet",
  },
  {
    title: "Swap dollars ↔ euros (stablecoins)",
    plain: "Change USDC into EURC (or back) without leaving Arc.",
    where: "Right → Money tools → Swap tab",
    try: "Stay on Arc Testnet · small amount · Confirm",
  },
  {
    title: "Move USDC between networks",
    plain: "Bridge value from Arc to Base (or reverse) so funds sit on the chain you need.",
    where: "Right → Money tools → Bridge tab",
    try: "Have USDC on the *from* network · Confirm each wallet step",
  },
  {
    title: "Ask in plain English",
    plain: "Type what you want; the agent plans it. Nothing moves until you press Confirm.",
    where: "Left side → chat box",
    try: "“Show my balances” or “Swap 1 USDC to EURC”",
  },
];

const UI_MAP = [
  {
    icon: MessageSquare,
    name: "Chat (left)",
    role: "Talk to the AI agent. It only plans — you confirm money moves.",
  },
  {
    icon: Wallet,
    name: "Connect + faucet",
    role: "Top-right Connect → Arc Testnet → free test USDC (Circle faucet).",
  },
  {
    icon: Send,
    name: "Money tools → Send",
    role: "Pay a full 0x address on Arc (best first action).",
  },
  {
    icon: ArrowRightLeft,
    name: "Money tools → Swap / Bridge",
    role: "Swap USDC↔EURC on Arc, or move USDC across chains.",
  },
  {
    icon: Bot,
    name: "Money tools → More",
    role: "QR pay, payroll, risk check, unified balance (advanced).",
  },
];

/**
 * Plain-language guide for first-time users who find crypto UI confusing.
 */
export function UserGuideCard() {
  const [open, setOpen] = useState(false);
  const [helpQ, setHelpQ] = useState("");
  const [helpA, setHelpA] = useState<string | null>(null);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpErr, setHelpErr] = useState<string | null>(null);

  async function askHelp(preset?: string) {
    const message = (preset || helpQ).trim();
    if (!message) return;
    setHelpBusy(true);
    setHelpErr(null);
    setHelpA(null);
    try {
      const res = await fetch("/api/ai/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: "dashboard user-guide panel",
        }),
      });
      const data = (await res.json()) as {
        answer?: string;
        error?: string;
        message?: string;
        note?: string;
        ok?: boolean;
      };
      // Prefer answer body even on non-2xx (older deployments returned 502 + answer)
      if (data.answer) {
        setHelpA(
          data.note ? `${data.answer}\n\n_${data.note}_` : data.answer,
        );
        if (!preset) setHelpQ("");
        return;
      }
      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      setHelpA("No answer.");
      if (!preset) setHelpQ("");
    } catch (e) {
      setHelpErr(e instanceof Error ? e.message : "Help failed");
    } finally {
      setHelpBusy(false);
    }
  }

  return (
    <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] to-transparent">
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-400" />
            New here? What is this app?
          </CardTitle>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-500 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-xs text-slate-400">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 space-y-2">
            <p className="text-sm text-slate-200 font-medium leading-snug">
              AGFusion helps you <span className="text-cyan-300">send</span>,{" "}
              <span className="text-cyan-300">swap</span>, and{" "}
              <span className="text-cyan-300">move</span> digital dollars (USDC)
              on Arc — with an AI helper that explains the plan first.
            </p>
            <p className="leading-relaxed">
              Think of it as a <strong className="text-slate-300">control panel for
              money</strong>, not a bank account. Your wallet holds the funds. This
              app only prepares actions; you always approve in Rabby/MetaMask.
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-400/90 mb-2 font-medium">
              3 steps to try it (test money)
            </div>
            <ol className="space-y-2 text-slate-300">
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">
                  1
                </Badge>
                <span>
                  Click <strong className="text-white">Connect</strong> (top right) →
                  pick Rabby → choose <strong className="text-white">Arc Testnet</strong>
                </span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">
                  2
                </Badge>
                <span>
                  Get free test USDC:{" "}
                  <a
                    href="https://faucet.circle.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    faucet.circle.com
                  </a>{" "}
                  (select Arc Testnet)
                </span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">
                  3
                </Badge>
                <span>
                  Use <strong className="text-white">Payment Engine</strong> to send{" "}
                  <strong className="text-white">0.05 USDC</strong> to an address you
                  control — or type in chat: “Show my balances”
                </span>
              </li>
            </ol>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-400/90 mb-2 font-medium">
              What can I use it for?
            </div>
            <div className="space-y-2">
              {USE_CASES.map((u) => (
                <div
                  key={u.title}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
                >
                  <div className="text-slate-200 font-medium text-[12px]">
                    {u.title}
                  </div>
                  <p className="mt-0.5 text-slate-400 leading-relaxed">{u.plain}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    <span className="text-cyan-500/90">Where:</span> {u.where}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    <span className="text-cyan-500/90">Try:</span> {u.try}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-400/90 mb-2 font-medium">
              What is each part of the screen?
            </div>
            <ul className="space-y-2">
              {UI_MAP.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.name} className="flex gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-cyan-400/90 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-slate-200 font-medium text-[12px]">
                        {item.name}
                      </div>
                      <p className="text-slate-500 leading-relaxed">{item.role}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
            <strong className="text-slate-400">Important:</strong> This is{" "}
            <em>testnet</em> practice money (not real cash). Never share seed
            phrases. Wallet popups that move funds will always ask you to Confirm —
            cancel if you did not start an action.
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400/90 font-medium">
              Ask AI help (Claude when configured)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "I am lost, where do I start?",
                "How do I send USDC?",
                "What is swap vs bridge?",
              ].map((q) => (
                <Button
                  key={q}
                  size="sm"
                  variant="outline"
                  type="button"
                  className="h-7 text-[10px] px-2"
                  disabled={helpBusy}
                  onClick={() => void askHelp(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                className="h-9 text-xs"
                value={helpQ}
                onChange={(e) => setHelpQ(e.target.value)}
                placeholder="Ask anything about using AGFusion…"
                disabled={helpBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void askHelp();
                }}
              />
              <Button
                size="sm"
                type="button"
                className="shrink-0 h-9"
                disabled={helpBusy || !helpQ.trim()}
                onClick={() => void askHelp()}
              >
                {helpBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Ask"
                )}
              </Button>
            </div>
            {helpErr && (
              <p className="text-[11px] text-red-400">{helpErr}</p>
            )}
            {helpA && (
              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-2.5 text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {helpA}
              </div>
            )}
          </div>

          <Button asChild size="sm" variant="outline" className="w-full">
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              Open free test USDC faucet
            </a>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
