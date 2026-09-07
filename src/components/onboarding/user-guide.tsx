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
    where: "Operate → Money tools → Send (right column on desktop)",
    try: "Paste a full 0x address · amount 0.05 · Continue / Confirm send · approve in wallet",
  },
  {
    title: "Swap dollars ↔ euros (stablecoins)",
    plain: "Change USDC into EURC (or back) without leaving Arc.",
    where: "Operate → Money tools → Swap (right column on desktop)",
    try: "Choose tokens and amount · Get live quote · review slippage · Continue / Confirm swap",
  },
  {
    title: "Move USDC between networks",
    plain: "Bridge value from Arc to Base (or reverse) so funds sit on the chain you need.",
    where: "Operate → Money tools → Bridge (right column on desktop)",
    try: "Have test USDC and gas on the source network · review the route · approve each wallet step",
  },
  {
    title: "Ask in plain English",
    plain: "Ask a question or request a plan. Review any action preview before confirming execution.",
    where: "AI Operator (left column on desktop) → message box",
    try: "“Show my balances” or “Swap 1 USDC to EURC”",
  },
];

const UI_MAP = [
  {
    icon: MessageSquare,
    name: "AI Operator",
    role: "Ask questions and prepare actions. Review the plan and wallet request before approving.",
  },
  {
    icon: Wallet,
    name: "Connect + faucet",
    role: "Connect your wallet from the header, then fund its Arc Testnet address at the Circle faucet.",
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
    role: "QR / payment link, batch payroll, route risk check, unified balance, and stuck transfer recovery.",
  },
];

/**
 * Plain-language guide for first-time users who find crypto UI confusing.
 */
export function UserGuideCard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-foreground">
          <button
            id="guide"
            type="button"
            aria-expanded={open}
            aria-controls="guide-content"
            className="flex min-h-11 w-full scroll-mt-24 items-center justify-between gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => onOpenChange(!open)}
          >
            <span className="flex items-center gap-2">
              <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
              New here? What is this app?
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </button>
        </CardTitle>
      </CardHeader>
        <CardContent id="guide-content" role="region" hidden={!open} aria-labelledby="guide" className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl border border-border bg-muted p-3 space-y-2">
            <p className="text-sm text-foreground font-medium leading-snug">
              AGFusion helps you <span className="text-accent">send</span>,{" "}
              <span className="text-accent">swap</span>, and{" "}
              <span className="text-accent">move</span> digital dollars (USDC)
              on Arc — with an AI helper that explains the plan first.
            </p>
            <p className="leading-relaxed">
              Think of it as a <strong className="text-foreground">control panel for
              money</strong>, not a bank account. Your wallet holds the funds. This
              app helps prepare and submit actions. Review transaction details and
              any wallet permissions before approving.
            </p>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-accent mb-2 font-medium">
              3 steps to try it (test money)
            </div>
            <ol className="space-y-2 text-foreground">
              <li className="flex gap-2">
                <Badge variant="outline" className="h-5 shrink-0 font-mono text-[10px]">
                  1
                </Badge>
                <span>
                  Use <strong>Connect wallet</strong> in the header, choose an
                  available wallet, and switch to <strong>Arc Testnet</strong>.
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
                    className="inline-flex min-h-11 items-center rounded text-accent underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent"
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
                  Open <strong>Operate → Money tools → Send</strong> (right column
                  on desktop) to send <strong>0.05 USDC</strong> to an address you
                  control, or ask <strong>AI Operator</strong>: “Show my balances”.
                </span>
              </li>
            </ol>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-accent mb-2 font-medium">
              What can I use it for?
            </div>
            <div className="space-y-2">
              {USE_CASES.map((u) => (
                <div
                  key={u.title}
                  className="rounded-lg border border-border bg-muted p-3"
                >
                  <div className="text-foreground font-medium text-sm">
                    {u.title}
                  </div>
                  <p className="mt-0.5 text-muted-foreground leading-relaxed">{u.plain}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    <span className="text-accent">Where:</span> {u.where}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="text-accent">Try:</span> {u.try}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-accent mb-2 font-medium">
              What is each part of the screen?
            </div>
            <ul className="space-y-2">
              {UI_MAP.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.name} className="flex gap-2.5">
                    <Icon aria-hidden="true" className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                    <div>
                      <div className="text-foreground font-medium text-sm">
                        {item.name}
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{item.role}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important:</strong> This is{" "}
            <em>testnet</em> practice money (not real cash). Never share seed
            phrases. Check the network, recipient, amount, and permissions in each
            wallet request. Cancel requests you did not start.
          </div>

          <div className="rounded-xl border border-border bg-muted p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-accent font-medium">
              Ask AI help
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
                  className="h-auto min-h-11 whitespace-normal text-left text-xs px-3 py-2 focus-visible:ring-accent"
                  disabled={helpBusy}
                  onClick={() => void askHelp(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
            <label htmlFor="guide-help-question" className="block text-sm font-medium text-foreground">Your question</label>
            <div className="flex gap-2">
              <Input
                id="guide-help-question"
                className="h-11 min-w-0 text-base sm:text-sm"
                aria-describedby={helpErr ? "guide-help-error" : undefined}
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
                className="shrink-0 h-11 min-w-11"
                aria-label={helpBusy ? "Asking for help" : "Ask for help"}
                disabled={helpBusy || !helpQ.trim()}
                onClick={() => void askHelp()}
              >
                {helpBusy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  "Ask"
                )}
              </Button>
            </div>
            {helpErr && (
              <p id="guide-help-error" role="alert" className="text-sm text-danger">{helpErr}</p>
            )}
            <p role="status" aria-atomic="true" className="sr-only">{helpBusy ? "Getting help..." : helpA ? "Help answer ready below." : ""}</p>
            {helpA && (
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {helpA}
              </div>
            )}
          </div>

          <Button asChild size="sm" variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-2">
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              Open free test USDC faucet
            </a>
          </Button>
        </CardContent>
    </Card>
  );
}
