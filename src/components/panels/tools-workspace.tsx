"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  MoreHorizontal,
  QrCode,
  Send,
  ShieldAlert,
  Users,
  Wallet,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BridgePanelBody,
  RecoveryPanelBody,
  SendPanelBody,
} from "@/components/panels/action-panels";
import { ProductionSwapPanel } from "@/components/panels/production-swap-panel";
import { QrPayCard } from "@/components/pay/qr-pay";
import { BatchPayrollCard } from "@/components/pay/batch-payroll";
import { RiskOracleCard } from "@/components/pay/risk-oracle";
import { UnifiedBalanceCard } from "@/components/balance/unified-balance";

type TabId = "send" | "swap" | "bridge" | "more";

const TABS: Array<{
  id: TabId;
  label: string;
  short: string;
  icon: typeof Send;
  blurb: string;
  step: string;
}> = [
  {
    id: "send",
    label: "Send",
    short: "Pay someone",
    icon: Send,
    blurb: "Transfer test USDC to a full 0x wallet address on Arc.",
    step: "1 · Amount  →  2 · Paste 0x  →  3 · Confirm in wallet",
  },
  {
    id: "swap",
    label: "Swap",
    short: "Live token exchange",
    icon: Waypoints,
    blurb: "Get a live Circle quote and swap supported tokens on Arc Testnet.",
    step: "1 · From / To  →  2 · Live quote  →  3 · Confirm in wallet",
  },
  {
    id: "bridge",
    label: "Bridge",
    short: "Move chains",
    icon: Waypoints,
    blurb: "Move USDC between Arc and Base (and similar testnets).",
    step: "1 · Amount  →  2 · From / To  →  3 · Confirm each step",
  },
  {
    id: "more",
    label: "More",
    short: "Advanced",
    icon: MoreHorizontal,
    blurb: "QR pay requests, batch payroll, risk check, unified balance.",
    step: "Optional tools — start with Send if you are new",
  },
];

/**
 * Professional tabbed money tools — right column of dashboard.
 * Chat agent is separate (left) and intentionally untouched.
 */
export function ToolsWorkspace({
  defaultTab = "send",
}: {
  defaultTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const active = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <section
      id="tools"
      className="glow-border scroll-mt-24 overflow-hidden rounded-2xl border border-cyan-400/10 bg-gradient-to-b from-[#0c1526]/95 via-[#0a1220]/96 to-[#060d18] shadow-2xl shadow-black/30"
    >
      <div className="border-b border-white/[0.06] px-4 pt-4 pb-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label mb-1">Money tools</p>
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-50">
              Manual forms
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
              Same actions as chat — use buttons if you prefer. Nothing moves
              until you <strong className="font-semibold text-slate-200">Confirm</strong> in your wallet.
            </p>
          </div>
        </div>

        <div role="tablist" aria-label="Money tools" className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-[#040a14]/80 p-1 ring-1 ring-white/[0.07]">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2.5 text-center transition",
                  on ? "bg-gradient-to-b from-cyan-400/18 to-teal-500/10 text-cyan-50 shadow-sm ring-1 ring-cyan-400/35" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                )}
              >
                <Icon className={cn("h-4 w-4", on ? "text-teal-300" : "text-slate-500")} />
                <span className="text-[11px] font-semibold leading-none tracking-tight">{t.label}</span>
                <span className={cn("hidden text-[9px] leading-none sm:block", on ? "text-cyan-200/75" : "text-slate-600")}>{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-white/[0.05] bg-gradient-to-r from-teal-500/[0.04] via-transparent to-sky-500/[0.04] px-4 py-3 sm:px-5">
        <p className="text-[13px] font-medium leading-snug text-slate-200">{active.blurb}</p>
        <p className="mt-1.5 font-mono text-[10px] tracking-wide text-slate-500">{active.step}</p>
      </div>

      <div className="p-4 sm:p-5" role="tabpanel">
        {tab === "send" && <SendPanelBody />}
        {tab === "swap" && <ProductionSwapPanel />}
        {tab === "bridge" && <BridgePanelBody />}
        {tab === "more" && <MoreTools />}
      </div>
    </section>
  );
}

function MoreTools() {
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-slate-400">
        Advanced options. Most first-time users only need <strong className="text-slate-300">Send</strong>, <strong className="text-slate-300">Swap</strong>, or <strong className="text-slate-300">Bridge</strong>.
      </p>

      <Accordion icon={QrCode} title="QR / payment link" plain="Create a link or QR so someone can pay you test USDC.">
        <QrPayCard embedded />
      </Accordion>

      <Accordion icon={Users} title="Batch payroll" plain="Send the same or different amounts to several addresses at once.">
        <BatchPayrollCard embedded />
      </Accordion>

      <Accordion icon={ShieldAlert} title="Route risk check" plain="Quick safety score before a bridge or large transfer (optional micropay).">
        <RiskOracleCard embedded />
      </Accordion>

      <Accordion icon={Wallet} title="Unified balance" plain="Deposit from other chains and spend on Arc (advanced).">
        <UnifiedBalanceCard embedded />
      </Accordion>

      <Accordion icon={Waypoints} title="Stuck transfer recovery" plain="Retry a bridge that stopped mid-way.">
        <RecoveryPanelBody />
      </Accordion>
    </div>
  );
}

function Accordion({
  icon: Icon,
  title,
  plain,
  children,
}: {
  icon: typeof Send;
  title: string;
  plain: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
          <Icon className="h-4 w-4 text-cyan-400/90" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-slate-100">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{plain}</span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-slate-500 transition", open && "rotate-180 text-cyan-400")} />
      </button>
      {open && <div className="border-t border-white/[0.05] px-3 pb-3 pt-3">{children}</div>}
    </div>
  );
}
