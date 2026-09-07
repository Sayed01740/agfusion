"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
import { usePilotStore } from "@/store/pilot-store";
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
 * Reset every transaction amount field rendered inside the money-tools workspace
 * after a newly completed transaction. The transaction components remain the
 * source of truth for validation and execution; this only clears their local
 * form values after a confirmed success.
 */
function TransactionAmountResetter() {
  const transactions = usePilotStore((s) => s.transactions);
  const initialized = useRef(false);
  const seenSuccessIds = useRef(new Set<string>());

  useEffect(() => {
    const successfulIds = transactions
      .filter((tx) => tx.status === "success")
      .map((tx) => tx.id);

    if (!initialized.current) {
      successfulIds.forEach((id) => seenSuccessIds.current.add(id));
      initialized.current = true;
      return;
    }

    const newSuccess = successfulIds.filter((id) => !seenSuccessIds.current.has(id));
    if (!newSuccess.length) return;
    newSuccess.forEach((id) => seenSuccessIds.current.add(id));

    const root = document.getElementById("tools");
    if (!root) return;

    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .filter((input) => input.getAttribute("aria-label") !== "Custom slippage percentage");

    for (const input of inputs) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "0");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [transactions]);

  return null;
}

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <section
      id="tools"
      tabIndex={-1}
      aria-labelledby="tools-heading"
      className="glow-border scroll-mt-24 overflow-hidden rounded-3xl border border-border glass-cockpit shadow-2xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      <TransactionAmountResetter />
      <div className="border-b border-border/80 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Direct Operator Tools
            </p>
            <h2 id="tools-heading" className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
              Execution Terminal
            </h2>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-muted-foreground">
              Direct smart contract actions. Every operation requires a cryptographically verified wallet signature.
            </p>
          </div>
        </div>

        <div role="tablist" aria-label="Money tools" aria-orientation="horizontal" className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-muted/80 p-1.5 ring-1 ring-border/80 backdrop-blur-md">
          {TABS.map((t, index) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tools-tab-${t.id}`}
                aria-controls={`tools-panel-${t.id}`}
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node; }}
                onClick={() => setTab(t.id)}
                onKeyDown={(event) => {
                  let nextIndex: number;
                  switch (event.key) {
                    case "ArrowRight": nextIndex = (index + 1) % TABS.length; break;
                    case "ArrowLeft": nextIndex = (index - 1 + TABS.length) % TABS.length; break;
                    case "Home": nextIndex = 0; break;
                    case "End": nextIndex = TABS.length - 1; break;
                    default: return;
                  }
                  event.preventDefault();
                  setTab(TABS[nextIndex].id);
                  tabRefs.current[nextIndex]?.focus();
                }}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                  on
                    ? "bg-card text-accent ring-1 ring-accent/40 shadow-sm font-semibold"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className={cn("h-4 w-4", on ? "text-accent" : "text-muted-foreground")} />
                <span className="text-xs font-semibold leading-snug">{t.label}</span>
                <span className="hidden text-[10px] leading-snug text-muted-foreground sm:block">{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-border/80 bg-muted/50 px-4 py-3 sm:px-6 backdrop-blur-sm">
        <p className="text-xs sm:text-sm font-medium leading-relaxed text-foreground">{active.blurb}</p>

        <p id="tools-instructions" className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{active.step}</p>
      </div>

      {TABS.map((t) => (
        <div key={t.id} id={`tools-panel-${t.id}`} role="tabpanel" aria-labelledby={`tools-tab-${t.id}`} aria-describedby={tab === t.id ? "tools-instructions" : undefined} hidden={tab !== t.id} tabIndex={0} className="p-4 sm:p-5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
          {tab === t.id && (
            t.id === "send" ? <SendPanelBody /> :
            t.id === "swap" ? <ProductionSwapPanel /> :
            t.id === "bridge" ? <BridgePanelBody /> : <MoreTools />
          )}
        </div>
      ))}
    </section>
  );
}

function MoreTools() {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Advanced options. Most first-time users only need <strong className="text-foreground">Send</strong>, <strong className="text-foreground">Swap</strong>, or <strong className="text-foreground">Bridge</strong>.
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
  const contentId = useId();
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-start gap-3 px-3.5 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
          <Icon aria-hidden="true" className="h-4 w-4 text-accent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{plain}</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180 text-accent")} />
      </button>
      <div id={contentId} hidden={!open} className="border-t border-border px-3 pb-3 pt-3">{open && children}</div>
    </div>
  );
}
