"use client";

import Image from "next/image";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/providers/wallet-provider";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <div className="ag-premium-shell min-h-screen mesh-bg noise-overlay overflow-hidden relative">
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-50 z-0" />
        <div className="relative z-[1]">
          <Navbar />
          <main className="pb-24 md:pb-10">{children}</main>
          <footer className="hidden md:block mt-10 border-t border-slate-200">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-7 text-[11px] text-slate-500 sm:flex-row sm:px-6">
              <span className="inline-flex items-center gap-2.5">
                <Image src="/icon-32.png" alt="" width={16} height={16} className="rounded-sm opacity-90 ring-1 ring-slate-200" />
                <span><span className="font-display font-semibold text-slate-700">AGFusion</span><span className="mx-1.5 text-slate-300">·</span>Arc Testnet · USDC gas · confirm before every move</span>
              </span>
              <div className="flex items-center gap-4">
                <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" className="hover:text-blue-600 transition font-medium">X · {AGFUSION_X_HANDLE}</a>
                <a href="https://docs.arc.io" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">Arc docs</a>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">Faucet</a>
                <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">Explorer</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </WalletProvider>
  );
}
