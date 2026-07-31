"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bot,
  Code2,
  Home,
  LayoutDashboard,
  LineChart,
  Wallet,
  Settings,
} from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";
import { usePilotStore } from "@/store/pilot-store";
import { useWallet } from "@/providers/wallet-provider";

/** Simple X / Twitter glyph */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

const links = [
  { href: "/dashboard", label: "Workspace", icon: LayoutDashboard },
  { href: "/studio", label: "Studio", icon: Code2 },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/agents", label: "Agents", icon: Bot },
];

const mobileLinks = [
  { href: "/", label: "Home", icon: Home },
  ...links,
];

export function Navbar() {
  const pathname = usePathname();
  const { walletAddress, authenticated, developerMode, setDeveloperMode } = usePilotStore();
  const { connect, disconnect, connecting, walletName } = useWallet();

  const visibleLinks = developerMode ? links : links.filter(l => l.href !== "/studio");
  const visibleMobileLinks = developerMode ? mobileLinks : mobileLinks.filter(l => l.href !== "/studio");

  async function onWalletClick() {
    if (walletAddress) {
      disconnect();
      return;
    }
    await connect();
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-cyan-400/[0.08] bg-[#030712]/78 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#030712]/65">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label="AGFusion home"
          >
            <BrandLogo
              variant="icon"
              height={40}
              priority
              className="group-hover:shadow-cyan-400/40 transition-shadow"
            />
            <div className="leading-tight hidden xs:block sm:block">
              <div className="font-display text-sm font-semibold tracking-tight">
                <span className="text-gradient">AGFusion</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-400/70">
                On Arc · programmable money
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-1 shadow-inner shadow-black/30">
            {visibleLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors",
                    active
                      ? "text-white"
                      : "text-slate-400 hover:text-slate-100",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-xl border border-cyan-400/20 bg-gradient-to-b from-cyan-400/15 to-teal-500/5 shadow-sm shadow-cyan-500/15"
                      transition={{
                        type: "spring",
                        bounce: 0.18,
                        duration: 0.45,
                      }}
                    />
                  )}
                  <Icon className="relative h-3.5 w-3.5" />
                  <span className="relative font-semibold tracking-tight">
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDeveloperMode(!developerMode)}
              title={developerMode ? "Disable Developer Mode" : "Enable Developer Mode"}
              aria-label="Toggle Developer Mode"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
                developerMode
                  ? "border-cyan-500/40 bg-cyan-500/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-cyan-500/10"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <a
              href={AGFUSION_X_URL}
              target="_blank"
              rel="noopener noreferrer me"
              title={`AGFusion on X · ${AGFUSION_X_HANDLE}`}
              aria-label={`Follow AGFusion on X ${AGFUSION_X_HANDLE}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-cyan-500/10 transition"
            >
              <XIcon className="h-3.5 w-3.5" />
            </a>
            <span
              className={cn(
                "hidden sm:inline-flex text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 border font-medium",
                walletAddress
                  ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                  : "text-cyan-300/90 bg-cyan-500/10 border-cyan-500/25",
              )}
            >
              {walletAddress
                ? `${walletName || "Wallet"}${authenticated ? " · SIWE" : ""}`
                : "Arc Testnet"}
            </span>
            <Button
              variant={walletAddress ? "outline" : "default"}
              size="sm"
              onClick={() => void onWalletClick()}
              className="gap-2"
              type="button"
              disabled={connecting}
              title={
                walletAddress
                  ? "Click to disconnect"
                  : "Connect MetaMask, Rabby, Coinbase, Brave…"
              }
            >
              <Wallet className="h-3.5 w-3.5" />
              {connecting
                ? "…"
                : walletAddress
                  ? shortenAddress(walletAddress)
                  : "Connect"}
            </Button>
          </div>
        </div>
      </header>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-cyan-400/10 bg-[#030712]/96 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_48px_rgba(0,0,0,0.55)]">
        <div className="grid grid-cols-5 gap-0.5 px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${visibleMobileLinks.length}, minmax(0, 1fr))` }}>
          {visibleMobileLinks.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold tracking-tight transition",
                  active
                    ? "text-cyan-200 bg-cyan-500/12 ring-1 ring-cyan-400/20"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
