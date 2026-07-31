"use client";

import Image from "next/image";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/providers/wallet-provider";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <div className="min-h-screen mesh-bg noise-overlay">
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-50" />
        {/* Soft vignette */}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.55)_100%)]" />
        <div className="relative z-[1]">
          <Navbar />
          <main className="pb-24 md:pb-10">{children}</main>
          <footer className="hidden md:block mt-10 border-t border-cyan-400/[0.07]">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-7 text-[11px] text-slate-500 sm:flex-row sm:px-6">
              <span className="inline-flex items-center gap-2.5">
                <Image
                  src="/icon-32.png"
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm opacity-90 ring-1 ring-cyan-400/20"
                />
                <span>
                  <span className="font-display font-semibold text-slate-400">
                    AGFusion
                  </span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  Arc Testnet · USDC gas · confirm before every move
                </span>
              </span>
              <div className="flex items-center gap-4">
                <a
                  href={AGFUSION_X_URL}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="hover:text-cyan-400 transition font-medium"
                >
                  X · {AGFUSION_X_HANDLE}
                </a>
                <a
                  href="https://docs.arc.io"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-400 transition"
                >
                  Arc docs
                </a>
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-400 transition"
                >
                  Faucet
                </a>
                <a
                  href="https://testnet.arcscan.app"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-400 transition"
                >
                  Explorer
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </WalletProvider>
  );
}
