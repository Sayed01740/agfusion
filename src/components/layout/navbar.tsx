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

function XIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" /></svg>;
}

const links = [
  { href: "/dashboard", label: "Workspace", icon: LayoutDashboard },
  { href: "/studio", label: "Studio", icon: Code2 },
  { href: "/analytics", label: "Analytics", icon: LineChart },
];
const mobileLinks = [{ href: "/", label: "Home", icon: Home }, ...links];

export function Navbar() {
  const pathname = usePathname();
  const { walletAddress, developerMode, setDeveloperMode } = usePilotStore();
  const { connect, disconnect, connecting, enableAgentMode } = useWallet();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false);
      if (walletRef.current && !walletRef.current.contains(event.target as Node)) setWalletOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleLinks = developerMode ? links : links.filter((l) => l.href !== "/studio");
  const visibleMobileLinks = developerMode ? mobileLinks : mobileLinks.filter((l) => l.href !== "/studio");

  async function onWalletClick() {
    if (walletAddress) disconnect();
    else await connect();
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#07090d]/88 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#07090d]/76">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:h-[4.25rem] sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="AGFusion home">
            <BrandLogo variant="icon" height={34} priority className="h-8 w-8 sm:h-9 sm:w-9" />
            <div className="hidden leading-tight sm:block"><div className="font-display text-sm font-semibold tracking-tight text-slate-100">AGFusion</div><div className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-600">On Arc · programmable money</div></div>
          </Link>

          <nav className="hidden items-center gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.018] p-1 md:flex">
            {visibleLinks.map((link) => { const active = pathname.startsWith(link.href); const Icon = link.icon; return <Link key={link.href} href={link.href} className={cn("relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors", active ? "text-white" : "text-slate-500 hover:text-slate-200")}>{active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg border border-white/[0.09] bg-white/[0.055]" transition={{ type: "spring", bounce: 0.18, duration: 0.4 }} />}<Icon className="relative h-3.5 w-3.5" /><span className="relative font-semibold">{link.label}</span></Link>; })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative" ref={settingsRef}>
              <button onClick={() => setSettingsOpen(!settingsOpen)} title="Settings & Preferences" aria-label="Settings" className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all", settingsOpen || developerMode ? "border-white/[0.16] bg-white/[0.07] text-white" : "border-white/[0.08] bg-white/[0.025] text-slate-400 hover:text-white hover:border-white/[0.16]")}><Settings className={cn("h-4 w-4 transition-transform duration-300", settingsOpen && "rotate-45")} /></button>
              {settingsOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-[14rem] rounded-2xl border border-white/[0.09] bg-[#0b0f15]/96 p-2 shadow-[0_18px_44px_rgba(0,0,0,.38)] backdrop-blur-xl"><div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">Preferences</div><Button variant="ghost" size="sm" onClick={() => { setDeveloperMode(!developerMode); setSettingsOpen(false); }} className={cn("w-full justify-start gap-2.5 rounded-xl h-10", developerMode ? "text-slate-100 bg-white/[0.05]" : "text-slate-300")}><Settings className="h-4 w-4" /> Developer Mode {developerMode ? "On" : "Off"}</Button>{developerMode && <Link href="/agents" onClick={() => setSettingsOpen(false)}><Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2.5 rounded-xl h-10 text-slate-300"><Bot className="h-4 w-4" /> Manage Agents</Button></Link>}<div className="my-1 h-px bg-white/[0.06]" /><a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" onClick={() => setSettingsOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/[0.04] hover:text-white"><XIcon className="h-3.5 w-3.5" /> Follow {AGFUSION_X_HANDLE}</a></div>}
            </div>

            {walletAddress ? <div className="relative" ref={walletRef}><Button variant="outline" onClick={() => setWalletOpen(!walletOpen)} className={cn("gap-2 h-9 rounded-xl", walletOpen && "bg-white/[0.07]")}><Wallet className="h-4 w-4 text-slate-300" /><span className="font-mono tracking-wider font-medium">{shortenAddress(walletAddress)}</span></Button>{walletOpen && <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-[16rem] rounded-2xl border border-white/[0.09] bg-[#0b0f15]/96 p-2 shadow-[0_18px_44px_rgba(0,0,0,.38)] backdrop-blur-xl"><div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500"><span>Status</span><span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">Arc Testnet</span></div><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(walletAddress); alert("Address copied!"); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-slate-300"><Wallet className="h-4 w-4 text-slate-500" /> Copy Address</Button><Button variant="ghost" size="sm" onClick={() => { void enableAgentMode(); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-slate-200"><Bot className="h-4 w-4" /> Enable Auto-Agent</Button><div className="my-1 h-px bg-white/[0.06]" /><Button variant="ghost" size="sm" onClick={() => { void onWalletClick(); setWalletOpen(false); }} className="w-full justify-start gap-2.5 rounded-xl h-10 text-red-400 hover:bg-red-950/30"><LogOut className="h-4 w-4" /> Disconnect</Button></div>}</div> : <Button variant="default" size="sm" onClick={() => void onWalletClick()} className="h-9 gap-2 rounded-xl" disabled={connecting} title="Connect MetaMask, Rabby, Coinbase, Brave…"><Wallet className="h-4 w-4" /><span className="hidden xs:inline font-medium">{connecting ? "Connecting…" : "Connect Wallet"}</span></Button>}
          </div>
        </div>
      </header>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/[0.07] bg-[#07090d]/96 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_48px_rgba(0,0,0,.42)]"><div className="grid gap-0.5 px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${visibleMobileLinks.length}, minmax(0, 1fr))` }}>{visibleMobileLinks.map((link) => { const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href); const Icon = link.icon; return <Link key={link.href} href={link.href} className={cn("flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 min-h-[48px] text-[10px] font-semibold transition", active ? "text-white bg-white/[0.06] ring-1 ring-white/[0.08]" : "text-slate-600 hover:text-slate-300")}><Icon className="h-4 w-4" /><span>{link.label}</span></Link>; })}</div></nav>
    </>
  );
}
