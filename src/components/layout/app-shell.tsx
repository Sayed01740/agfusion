"use client";

import Image from "next/image";
import { MotionConfig } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/providers/wallet-provider";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user"><WalletProvider>
      <div className="ag-premium-shell min-h-screen mesh-bg noise-overlay overflow-hidden relative">
        {/* Cosmic Horizon Ambient Glow */}
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[420px] w-full max-w-6xl cosmic-horizon opacity-90 blur-3xl z-0" />

        {/* Ambient Aurora Orbs */}
        <div className="pointer-events-none fixed -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-emerald-500/12 blur-[130px] animate-float z-0" style={{ animationDuration: "14s" }} />
        <div className="pointer-events-none fixed top-[25%] -left-40 h-[500px] w-[500px] rounded-full bg-indigo-500/09 blur-[140px] animate-float z-0" style={{ animationDuration: "16s", animationDelay: "-5s" }} />
        <div className="pointer-events-none fixed -bottom-32 left-[25%] h-[450px] w-[550px] rounded-full bg-emerald-600/08 blur-[140px] z-0" />
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-35 z-0" />
        <div className="pointer-events-none fixed inset-0 dot-matrix opacity-25 z-0" />
        <div className="relative z-[1]">

          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <main id="main-content" tabIndex={-1} className="app-content">{children}</main>
          <footer className="hidden md:block mt-10 border-t border-white/[0.06]">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-7 text-[11px] text-slate-500 sm:flex-row sm:px-6">
              <span className="inline-flex items-center gap-2.5">
                <Image src="/icon-32.png" alt="" width={16} height={16} className="rounded-md opacity-85" />
                <span><span className="font-display font-semibold text-slate-300">AGFusion</span><span className="mx-1.5 text-slate-700">·</span>Arc Testnet · USDC gas · confirm before every move</span>
              </span>
              <div className="flex items-center gap-4">
                <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" className="hover:text-slate-200 transition font-medium">X · {AGFUSION_X_HANDLE}</a>
                <a href="https://docs.arc.io" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Arc docs</a>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Faucet</a>
                <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Explorer</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </WalletProvider></MotionConfig>
  );
}
