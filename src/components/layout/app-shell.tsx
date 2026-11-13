"use client";

import Image from "next/image";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/providers/wallet-provider";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";
import { ARC_EXPLORER, ARC_NETWORK_NAME, IS_ARC_MAINNET } from "@/lib/arc-chain";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user"><WalletProvider>
      <div className="ag-premium-shell min-h-screen mesh-bg overflow-x-clip relative">
        {/* Lightweight static grid atmosphere (zero-blur GPU cost) */}
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-35 z-0" />
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
                {!IS_ARC_MAINNET && (
                  <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Faucet</a>
                )}
                <a href={ARC_EXPLORER} target="_blank" rel="noreferrer" className="hover:text-slate-200 transition">Explorer</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </WalletProvider></MotionConfig>
  );
}
