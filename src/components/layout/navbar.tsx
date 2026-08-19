"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, Code2, Home, LayoutDashboard, LineChart, LogOut, Wallet, Settings } from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";
import { usePilotStore } from "@/store/pilot-store";
import { useWallet } from "@/providers/wallet-provider";

function XIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" /></svg>; }

const links = [{ href: "/dashboard", label: "Workspace", icon: LayoutDashboard }, { href: "/studio", label: "Studio", icon: Code2 }, { href: "/analytics", label: "Analytics", icon: LineChart }];
const mobileLinks = [{ href: "/", label: "Home", icon: Home }, ...links];

export function Navbar() {
  const pathname = usePathname();
  const { walletAddress, developerMode, setDeveloperMode } = usePilotStore();
  const { connect, disconnect, connecting, enableAgentMode } = useWallet();
  const [settingsOpen, setSettingsOpen] = useState(false); const [walletOpen, setWalletOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null); const walletRef = useRef<HTMLDivElement>(null);
  useEffect(() => { function handleClickOutside(event: MouseEvent) { if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false); if (walletRef.current && !walletRef.current.contains(event.target as Node)) setWalletOpen(false); } document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
  const visibleLinks = developerMode ? links : links.filter((l) => l.href !== "/studio");
  const visibleMobileLinks = developerMode ? mobileLinks : mobileLinks.filter((l) => l.href !== "/studio");
  async function onWalletClick() { if (walletAddress) disconnect(); else await connect(); }

  const brand = <Link href="/" className="flex min-w-0 items-center gap-2.5 group" aria-label="AGFusion home">
    <BrandLogo variant="icon" height={38} priority className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
    <div className="min-w-0 leading-tight">
      <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-[#172033] sm:text-base">AGFusion</div>
      <div className="hidden text-[8px] font-semibold uppercase tracking-[0.14em] text-[#64748b] lg:block">On Arc · programmable money</div>
    </div>
  </Link>;

  return <>
    <header className="sticky top-0 z-50 border-b border-[#e3e8ef] bg-white/95 text-[#172033] shadow-[0_4px_18px_rgba(15,23,42,.05)] backdrop-blur-2xl">
      <div className="relative mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:h-[4.25rem] sm:px-6">
        <div className="md:hidden flex min-w-0 items-center">
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setSettingsOpen(!settingsOpen)} title="Settings & Preferences" aria-label="Settings" className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all", settingsOpen || developerMode ? "border-[#cbd5e1] bg-[#f1f5f9] text-[#172033]" : "border-[#e2e8f0] bg-white text-[#64748b] hover:text-[#172033]")}><Settings className={cn("h-4 w-4 transition-transform duration-300", settingsOpen && "rotate-45")} /></button>
            {settingsOpen && <div className="absolute left-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-[14rem] rounded-2xl border border-[#d9e2ec] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,.12)]"><div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#64748b]">Preferences</div><Button variant="ghost" size="sm" onClick={() => { setDeveloperMode(!developerMode); setSettingsOpen(false); }} className={cn("w-full justify-start gap-2.5 rounded-xl h-10", developerMode ? "bg-[#eef2ff] text-[#172033]" : "text-[#475569]")}><Settings className="h-4 w-4" /> Developer Mode {developerMode ? "On" : "Off"}</Button>{developerMode && <Link href="/agents" onClick={() => setSettingsOpen(false)}><Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2.5 rounded-xl h-10 text-[#475569]"><Bot className="h-4 w-4" /> Manage Agents</Button></Link>}<div className="my-1 h-px bg-[#e2e8f0]" /><a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" onClick={() => setSettingsOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#64748b] hover:bg-[#f8fafc] hover:text-[#172033]"><XIcon className="h-3.5 w-3.5" /> Follow {AGFUSION_X_HANDLE}</a></div>}
          </div>
        </div>

        <div className="md:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          {brand}
        </div>

        <div className="hidden md:flex min-w-0 items-center">{brand}</div>

        <nav className="hidden items-center gap-0.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-1 md:flex">
          {visibleLinks.map((link) => { const active = pathname.startsWith(link.href); const Icon = link.icon; return <Link key={link.href} href={link.href} className={cn("relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors", active ? "text-[#172033]" : "text-[#64748b] hover:text-[#172033]")}>{active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg border border-[#dbe3ee] bg-white shadow-sm" transition={{ type: "spring", bounce: 0.18, duration: 0.4 }} />}<Icon className="relative h-3.5 w-3.5" /><span className="relative font-semibold">{link.label}</span></Link>; })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative md:block hidden" ref={settingsRef}>
            <button onClick={() => setSettingsOpen(!settingsOpen)} title="Settings & Preferences" aria-label="Settings" className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all", settingsOpen || developerMode ? "border-[#cbd5e1] bg-[#f1f5f9] text-[#172033]" : "border-[#e2e8f0] bg-white text-[#64748b] hover:text-[#172033]")}><Settings className={cn("h-4 w-4 transition-transform duration-300", settingsOpen && "rotate-45")} /></button>
            {settingsOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-[14rem] rounded-2xl border border-[#d9e2ec] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,.12)]"><div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#64748b]">Preferences</div><Button variant="ghost" size="sm" onClick={() => { setDeveloperMode(!developerMode); setSettingsOpen(false); }} className={cn("w-full justify-start gap-2.5 rounded-xl h-10", developerMode ? "bg-[#eef2ff] text-[#172033]" : "text-[#475569]")}><Settings className="h-4 w-4" /> Developer Mode {developerMode ? "On" : "Off"}</Button>{developerMode && <Link href="/agents" onClick={() => setSettingsOpen(false)}><Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2.5 rounded-xl h-10 text-[#475569]"><Bot className="h-4 w-4" /> Manage Agents</Button></Link>}<div className="my-1 h-px bg-[#e2e8f0]" /><a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" onClick={() => setSettingsOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#64748b] hover:bg-[#f8fafc] hover:text-[#172033]"><XIcon className="h-3.5 w-3.5" /> Follow {AGFUSION_X_HANDLE}</a></div>}
          </div>

          {walletAddress ? <div className="relative" ref={walletRef}><Button variant="outline" onClick={() => setWalletOpen(!walletOpen)} className={cn("gap-2 h-9 rounded-xl border-[#d9e2ec] bg-white text-[#172033]", walletOpen && "bg-[#f8fafc]")}><Wallet className="h-4 w-4 text-[#315bea]" /><span className="font-mono tracking-wider font-medium">{shortenAddress(walletAddress)}</span></Button>{walletOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-[16rem] rounded-2xl border border-[#d9e2ec] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,.12)]"><div className="flex items-center justify-between px-3 py-2 text-xs text-[#64748b]"><span>Status</span><span className="rounded-md border border-[#dbe3ee] bg-[#f8fafc] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#475569]">Arc Testnet</span></div><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(walletAddress); alert("Address copied!"); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-[#475569]"><Wallet className="h-4 w-4 text-[#64748b]" /> Copy Address</Button><Button variant="ghost" size="sm" onClick={() => { void enableAgentMode(); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-[#475569]"><Bot className="h-4 w-4 text-[#315bea]" /> Enable Auto-Agent</Button><div className="my-1 h-px bg-[#e2e8f0]" /><Button variant="ghost" size="sm" onClick={() => { void onWalletClick(); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-[#b42318] hover:bg-[#fef3f2]"><LogOut className="h-4 w-4" /> Disconnect</Button></div>}</div> : <Button variant="default" size="sm" onClick={() => void onWalletClick()} className="h-9 gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] via-[#2563eb] to-[#06b6d4] text-white shadow-[0_8px_20px_rgba(37,99,235,.18)]" disabled={connecting} title="Connect MetaMask, Rabby, Coinbase, Brave…"><Wallet className="h-4 w-4" /><span className="hidden xs:inline font-medium">{connecting ? "Connecting…" : "Connect Wallet"}</span></Button>}
        </div>
      </div>
    </header>
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-[#e2e8f0] bg-white/98 shadow-[0_-12px_36px_rgba(15,23,42,.08)] backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] md:hidden"><div className="grid gap-0.5 px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${visibleMobileLinks.length}, minmax(0, 1fr))` }}>{visibleMobileLinks.map((link) => { const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href); const Icon = link.icon; return <Link key={link.href} href={link.href} className={cn("flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition", active ? "bg-[#eef2ff] text-[#315bea] ring-1 ring-[#c7d2fe]" : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#172033]")}><Icon className="h-4 w-4" /><span>{link.label}</span></Link>; })}</div></nav>
  </>;
}
