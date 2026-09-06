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
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import { usePilotStore } from "@/store/pilot-store";
import { ARC_CHAIN_ID } from "@/lib/arc-chain";
import { SwapCard } from "@/components/dapp/swap-card";
import { SendCard } from "@/components/dapp/send-card";
import { BridgeCard } from "@/components/dapp/bridge-card";
import { BatchCard } from "@/components/dapp/batch-card";

type Tab = "swap" | "send" | "bridge" | "batch";

const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
  { id: "send", label: "Send", icon: Send },
  { id: "bridge", label: "Bridge", icon: Route },
  { id: "batch", label: "Batch", icon: Users },
];

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AGFusionDapp() {
  const [tab, setTab] = useState<Tab>("swap");
  const { openConnectModal, disconnect, switchToArc, connecting } = useWallet();
  const walletAddress = usePilotStore((s) => s.walletAddress);
  const walletChainId = usePilotStore((s) => s.walletChainId);

  const connected = Boolean(walletAddress);
  const onArc = walletChainId === ARC_CHAIN_ID;

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-10 sm:py-14">
      {/* Glow behind the card */}
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-[30rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.16),rgba(34,211,238,0.06),transparent_70%)] blur-2xl" />

      <div className="relative mb-5 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.75rem]">
          Trade, send &amp; bridge on Arc
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-slate-400">
          Swap stablecoins, send tokens, bridge across chains, and pay many
          recipients in one signature — all on Arc Testnet.
        </p>
      </div>

      {/* The card */}
      <div className="relative w-full rounded-[1.75rem] border border-white/[0.08] bg-[#0c1219]/90 p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-4">
        {/* Header: tabs + wallet */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 rounded-2xl bg-black/25 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors sm:px-3 ${
                  tab === id
                    ? "bg-white/[0.09] text-slate-50 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
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
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2 text-[12px] font-semibold text-slate-200 transition-colors hover:border-white/20"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono">{shortAddr(walletAddress!)}</span>
              <Power className="h-3 w-3 text-slate-500 group-hover:text-red-300" />
            </button>
          ) : (
            <button
              type="button"
              onClick={openConnectModal}
              disabled={connecting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_6px_20px_rgba(56,189,248,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
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
            onClick={switchToArc}
            className="mb-3 flex w-full items-center justify-between gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-left text-[12px] text-amber-100 transition-colors hover:bg-amber-400/15"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Wallet is on another network. Switch to Arc Testnet.
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
        <span className="font-mono text-slate-600">Arc Testnet · 5042002</span>
      </div>
    </section>
  );
}
