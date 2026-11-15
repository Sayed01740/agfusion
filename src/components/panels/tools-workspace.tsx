"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeftRight,
  ChevronDown,
  CreditCard,
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
  SendPanelBody,
} from "@/components/panels/action-panels";
import { ProductionSwapPanel } from "@/components/panels/production-swap-panel";
import { SWAP_HANDOFF_EVENT } from "@/lib/swap-handoff";

const RecoveryPanelBody = dynamic(
  () => import("@/components/panels/action-panels").then((m) => m.RecoveryPanelBody),
  { ssr: false },
);
const QrPayCard = dynamic(
  () => import("@/components/pay/qr-pay").then((m) => m.QrPayCard),
  { ssr: false },
);
const BatchPayrollCard = dynamic(
  () => import("@/components/pay/batch-payroll").then((m) => m.BatchPayrollCard),
  { ssr: false },
);
const RiskOracleCard = dynamic(
  () => import("@/components/pay/risk-oracle").then((m) => m.RiskOracleCard),
  { ssr: false },
);
const OnrampCard = dynamic(
  () => import("@/components/pay/onramp-card").then((m) => m.OnrampCard),
  { ssr: false },
);
const UnifiedBalanceCard = dynamic(
  () => import("@/components/balance/unified-balance").then((m) => m.UnifiedBalanceCard),
  { ssr: false },
);

type TabId = "send" | "swap" | "bridge" | "more";

const TABS: Array<{
  id: TabId;
  label: string;
  short: string;
  icon: typeof Send;
}> = [
  {
    id: "send",
    label: "Send",
    short: "USDC Transfer",
    icon: Send,
  },
  {
    id: "swap",
    label: "Swap",
    short: "Exchange",
    icon: ArrowLeftRight,
  },
  {
    id: "bridge",
    label: "Bridge",
    short: "Cross-Chain",
    icon: Waypoints,
  },
  {
    id: "more",
    label: "More",
    short: "Utilities",
    icon: MoreHorizontal,
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

  // Chat agent hands a planned swap to the Swap tab (Mainnet Permit2 flow).
  useEffect(() => {
    const onHandoff = () => {
      setTab("swap");
      document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(SWAP_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(SWAP_HANDOFF_EVENT, onHandoff);
  }, []);

  return (
    <section
      id="tools"
      tabIndex={-1}
      aria-labelledby="tools-heading"
      className="glow-border scroll-mt-24 overflow-hidden rounded-3xl border border-border glass-cockpit shadow-2xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      <TransactionAmountResetter />
      <div className="border-b border-white/[0.08] px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="tools-heading" className="font-display text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
            Actions
          </h2>
          <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            Instant Execution
          </span>
        </div>

        <div role="tablist" aria-label="Money tools" aria-orientation="horizontal" className="mt-3.5 grid grid-cols-4 gap-1.5 rounded-2xl bg-slate-950/70 p-1.5 ring-1 ring-white/[0.08]">
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
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                  on
                    ? "bg-card text-accent ring-1 ring-accent/40 shadow-md shadow-accent/5 font-bold"
                    : "text-slate-300 hover:bg-card/60 hover:text-foreground font-semibold",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", on ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-slate-300")}>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                <span className="font-display text-[13px] font-bold tracking-tight leading-snug">{t.label}</span>
                <span className={cn("hidden text-[10px] font-medium leading-snug sm:block", on ? "text-slate-200" : "text-slate-400")}>{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {TABS.map((t) => (
        <div key={t.id} id={`tools-panel-${t.id}`} role="tabpanel" aria-labelledby={`tools-tab-${t.id}`} hidden={tab !== t.id} tabIndex={0} className="p-4 sm:p-5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
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
    <div className="space-y-2.5">
      <Accordion icon={CreditCard} title="Buy USDC (Fiat Onramp)" plain="Fund your wallet with Debit Card, Apple Pay, Google Pay, or Bank Transfer.">
        <OnrampCard embedded />
      </Accordion>

      <Accordion icon={QrCode} title="QR & Payment Links" plain="Generate a shareable payment request or QR code.">
        <QrPayCard embedded />
      </Accordion>

      <Accordion icon={Users} title="Batch Payouts" plain="Disperse token payments to multiple addresses.">
        <BatchPayrollCard embedded />
      </Accordion>

      <Accordion icon={ShieldAlert} title="Route Risk Analysis" plain="Inspect liquidity and congestion risks before moving funds.">
        <RiskOracleCard embedded />
      </Accordion>

      <Accordion icon={Wallet} title="Unified Balance" plain="Cross-chain deposit and balance aggregation.">
        <UnifiedBalanceCard embedded />
      </Accordion>

      <Accordion icon={Waypoints} title="Bridge Recovery" plain="Claim or retry an incomplete cross-chain transfer.">
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
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card/70 transition-colors hover:border-accent/30">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-start gap-3 px-3.5 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
          <Icon aria-hidden="true" className="h-4 w-4 text-accent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold tracking-tight text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{plain}</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("mt-1.5 h-4 w-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none", open && "rotate-180 text-accent")} />
      </button>
      <div id={contentId} hidden={!open} className="border-t border-white/[0.08] px-3.5 pb-3.5 pt-3">{open && children}</div>
    </div>
  );
}
