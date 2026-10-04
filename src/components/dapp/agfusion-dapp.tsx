"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Send,
  Route,
  Users,
  Wallet,
  AlertTriangle,
  ChevronRight,
  Power,
  Bot,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import { usePilotStore } from "@/store/pilot-store";
import { ARC_CHAIN_ID, ARC_NETWORK_NAME, getArcNetworkMeta } from "@/lib/arc-chain";
import { SwapCard } from "@/components/dapp/swap-card";
import { SendCard } from "@/components/dapp/send-card";
import { BridgeCard } from "@/components/dapp/bridge-card";
import { BatchCard } from "@/components/dapp/batch-card";
import { ArcGasSavingsBanner } from "@/components/dapp/arc-gas-savings";
import { SessionKeyManager } from "@/components/dapp/session-key-manager";
import { X402Showcase } from "@/components/dapp/x402-showcase";

type Tab = "swap" | "send" | "bridge" | "batch" | "agents";

const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
  { id: "send", label: "Send", icon: Send },
  { id: "bridge", label: "Bridge", icon: Route },
  { id: "batch", label: "Batch", icon: Users },
  { id: "agents", label: "Agent OS", icon: Bot },
];

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AGFusionDapp() {
  const [tab, setTab] = useState<Tab>("swap");
  const { openConnectModal, disconnect, switchToArc, connecting } = useWallet();
  const walletAddress = usePilotStore((s) => s.walletAddress);
  const walletChainId = usePilotStore((s) => s.walletChainId);
  const meta = getArcNetworkMeta(walletChainId);

  const connected = Boolean(walletAddress);
  const onArc = walletChainId === 5042 || walletChainId === 5042002;

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-10 sm:py-14">
      {/* Ambient Arc Mint & Cyan Glow behind the card */}
      <div className="pointer-events-none absolute left-1/2 top-20 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(5,242,155,0.18),rgba(6,182,212,0.12),transparent_70%)] blur-3xl" />

      <div className="relative mb-5 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-[1.85rem]">
          Trade, send &amp; bridge on Arc
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-slate-300">
          Swap stablecoins, send tokens, bridge across chains, and pay many
          recipients in one signature — all on {meta.name}.
        </p>
      </div>

      {/* Arc Native USDC Gas Banner */}
      <ArcGasSavingsBanner />

      {/* The card */}
      <div className="relative w-full rounded-[2rem] border border-white/[0.1] bg-[#0c1219]/90 p-3.5 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-2xl sm:p-4.5">
        {/* Header: tabs + wallet */}
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-black/40 border border-white/[0.04] p-1 shadow-inner">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] sm:text-[13px] font-semibold transition-all ${
                  tab === id
                    ? "bg-gradient-to-r from-white/[0.12] to-white/[0.08] text-white shadow-sm border border-white/[0.08]"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden xs:inline sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {connected ? (
            <button
              type="button"
              onClick={disconnect}
              title="Disconnect"
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-slate-100 transition-all hover:border-white/25 hover:bg-white/[0.09]"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="font-mono">{shortAddr(walletAddress!)}</span>
              <Power className="h-3 w-3 text-slate-400 group-hover:text-red-300 transition-colors" />
            </button>
          ) : (
            <button
              type="button"
              onClick={openConnectModal}
              disabled={connecting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-3.5 py-2 text-[12px] font-bold text-slate-950 shadow-[0_4px_20px_rgba(5,242,155,0.35)] transition-all hover:scale-[1.02] hover:brightness-110 disabled:opacity-60"
            >
              <Wallet className="h-3.5 w-3.5" />
              {connecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>

        {/* Wrong-network banner */}
        {connected && !onArc && (
          <button
            type="button"
            onClick={() => void switchToArc()}
            className="mb-3 flex w-full items-center justify-between gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-left text-[12px] text-amber-100 transition-colors hover:bg-amber-400/15"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Wallet is on another network. Switch to Arc Network.
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold">
              Switch <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}

        {/* Active card */}
        <div className="rounded-3xl bg-[#0a0f16]/60 p-2.5 sm:p-3">
          {tab === "swap" && <SwapCard connected={connected} />}
          {tab === "send" && <SendCard connected={connected} />}
          {tab === "bridge" && <BridgeCard connected={connected} />}
          {tab === "batch" && <BatchCard connected={connected} />}
          {tab === "agents" && (
            <div className="space-y-3">
              <SessionKeyManager />
              <X402Showcase />
            </div>
          )}
        </div>
      </div>

      {/* Footer links */}
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-slate-500">
        <Link href="/welcome" className="transition-colors hover:text-slate-300">
          About AGFusion
        </Link>
        <span className="text-slate-700">·</span>
        <Link href="/dashboard" className="transition-colors hover:text-slate-300">
          Full workspace
        </Link>
        <span className="text-slate-700">·</span>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-slate-300"
        >
          Get testnet USDC
        </a>
        <span className="text-slate-700">·</span>
        <span className="font-mono text-slate-600">{meta.name} · {meta.chainId}</span>
      </div>
    </section>
  );
}
