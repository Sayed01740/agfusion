"use client";

import Image from "next/image";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/providers/wallet-provider";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";
import { ARC_EXPLORER, ARC_NETWORK_NAME } from "@/lib/arc-chain";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user"><WalletProvider>
      <div className="ag-premium-shell min-h-screen mesh-bg noise-overlay overflow-hidden relative">
        {/* Cosmic Horizon Ambient Glow */}
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[420px] w-full max-w-6xl cosmic-horizon opacity-90 blur-3xl z-0" />

        {/* Ambient Arc Signature Lighting Orbs */}
        <div className="pointer-events-none fixed -top-32 right-[-5%] h-[580px] w-[580px] rounded-full bg-emerald-400/14 blur-[140px] animate-float z-0" style={{ animationDuration: "16s" }} />
        <div className="pointer-events-none fixed top-[20%] -left-32 h-[520px] w-[520px] rounded-full bg-cyan-500/12 blur-[140px] animate-float z-0" style={{ animationDuration: "18s", animationDelay: "-6s" }} />
        <div className="pointer-events-none fixed -bottom-36 left-[30%] h-[500px] w-[600px] rounded-full bg-emerald-500/10 blur-[150px] z-0" />
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-30 z-0" />
        <div className="pointer-events-none fixed inset-0 dot-matrix opacity-20 z-0" />
        <div className="relative z-[1]">

          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <main id="main-content" tabIndex={-1} className="app-content">{children}</main>
          <footer className="hidden md:block mt-10 border-t border-white/[0.06]">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-7 text-[11px] text-slate-500 sm:flex-row sm:px-6">
              <span className="inline-flex items-center gap-2.5">
                <Image src="/icon-32.png" alt="" width={16} height={16} className="rounded-md opacity-85" />
                <span><span className="font-display font-semibold text-slate-300">AGFusion</span><span className="mx-1.5 text-slate-700">·</span>{ARC_NETWORK_NAME} · USDC gas · confirm before every move</span>
              </span>
              <div className="flex items-center gap-4">
                <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" className="hover:text-slate-200 transition font-medium">X · {AGFUSION_X_HANDLE}</a>
                <Link href="/docs" className="hover:text-slate-200 transition font-medium">Docs</Link>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Faucet</a>
                <a href={ARC_EXPLORER} target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Explorer</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </WalletProvider></MotionConfig>
  );
}
