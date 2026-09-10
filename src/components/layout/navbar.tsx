"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:transform-none";
const panelClass = "absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl max-h-[calc(100dvh-9rem)] overflow-y-auto";

export function Navbar() {
  const pathname = usePathname();
  const { walletAddress, developerMode, setDeveloperMode } = usePilotStore();
  const { connect, disconnect, connecting, enableAgentMode } = useWallet();
  const [openMenu, setOpenMenu] = useState<"settings" | "wallet" | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();
  const walletId = useId();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!openMenu) return;
    const container = openMenu === "settings" ? settingsRef.current : walletRef.current;
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !container?.contains(event.target)) setOpenMenu(null);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpenMenu(null);
      container?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openMenu]);

  useEffect(() => { setOpenMenu(null); }, [pathname]);

  const visibleLinks = developerMode ? links : links.filter((link) => link.href !== "/studio");
  const visibleMobileLinks = developerMode ? mobileLinks : mobileLinks.filter((link) => link.href !== "/studio");
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  async function onWalletClick() { if (walletAddress) disconnect(); else await connect(); }
  function closeMenu() {
    const container = openMenu === "settings" ? settingsRef.current : walletRef.current;
    setOpenMenu(null);
    container?.querySelector<HTMLButtonElement>("button")?.focus();
  }

  return <>
    <header className="app-navbar sticky top-0 z-50 border-b border-white/[0.08] bg-[#070a0e]/80 text-foreground shadow-2xl backdrop-blur-3xl transition-colors">
      <div className="mx-auto grid min-h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 md:flex md:justify-between sm:px-6">
        <Link href="/" className={cn("group flex min-h-11 min-w-11 items-center gap-2.5 justify-self-start rounded-lg", focusClass)} aria-label="AGFusion home" aria-current={pathname === "/" ? "page" : undefined} onClick={() => setOpenMenu(null)}>
          <BrandLogo variant="icon" height={38} priority className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <div className="hidden min-w-0 leading-tight min-[400px]:block">
            <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-foreground sm:text-base">AGFusion</div>
          </div>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 rounded-xl border border-border bg-muted p-1 md:flex">
          {visibleLinks.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMenu(null)} className={cn("relative flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors", focusClass, active ? "text-accent" : "text-muted-foreground hover:text-foreground")}>
              {active && <motion.span aria-hidden="true" layoutId={reducedMotion ? undefined : "nav-pill"} className="absolute inset-0 rounded-lg border border-accent/25 bg-accent/10 shadow-sm" transition={reducedMotion ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.4 }} />}
              <Icon aria-hidden="true" className="relative h-3.5 w-3.5" /><span className="relative font-semibold">{link.label}</span>
            </Link>;
          })}
        </nav>

        <div className="relative flex shrink-0 items-center gap-2">
          <div className="md:relative" ref={settingsRef}>
            <button type="button" onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")} title="Settings & Preferences" aria-label="Settings" aria-expanded={openMenu === "settings"} aria-controls={settingsId} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors", focusClass, openMenu === "settings" || developerMode ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              <Settings aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-300 motion-reduce:transition-none motion-reduce:transform-none", openMenu === "settings" && "rotate-45")} />
            </button>
            <div id={settingsId} hidden={openMenu !== "settings"} className={cn(panelClass, "max-w-56")}>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preferences</div>
              <Button variant="ghost" size="sm" type="button" aria-pressed={developerMode} onClick={() => { setDeveloperMode(!developerMode); closeMenu(); }} className={cn("min-h-11 w-full justify-start gap-2.5 rounded-xl text-foreground", focusClass, developerMode && "bg-accent/10 text-accent")}>
                <Settings aria-hidden="true" className="h-4 w-4" /> Developer Mode {developerMode ? "On" : "Off"}
              </Button>
              {developerMode && <Button asChild variant="ghost" size="sm" className={cn("mt-1 min-h-11 w-full justify-start gap-2.5 rounded-xl text-foreground", focusClass)}><Link href="/agents" aria-current={isActive("/agents") ? "page" : undefined} onClick={() => setOpenMenu(null)}><Bot aria-hidden="true" className="h-4 w-4" /> Manage Agents</Link></Button>}
              <div className="my-1 h-px bg-border" />
              <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" onClick={closeMenu} className={cn("flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", focusClass)}><XIcon className="h-3.5 w-3.5" /> Follow {AGFUSION_X_HANDLE}<span className="sr-only"> (opens in a new tab)</span></a>
            </div>
          </div>

          {walletAddress ? <div className="relative" ref={walletRef}>
            <Button variant="outline" type="button" onClick={() => setOpenMenu(openMenu === "wallet" ? null : "wallet")} aria-label={`Wallet options for ${shortenAddress(walletAddress)}`} aria-expanded={openMenu === "wallet"} aria-controls={walletId} className={cn("min-h-11 gap-2 rounded-xl border-border bg-card px-3 text-foreground", focusClass, openMenu === "wallet" && "bg-muted")}>
              <Wallet aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" /><span className="font-mono text-xs font-medium sm:text-sm">{shortenAddress(walletAddress)}</span>
            </Button>
            <div id={walletId} hidden={openMenu !== "wallet"} className={cn(panelClass, "max-w-64")}>
              <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground"><span>Status</span><span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">Arc Testnet</span></div>
              <Button variant="ghost" size="sm" type="button" onClick={() => { navigator.clipboard.writeText(walletAddress); alert("Address copied!"); closeMenu(); }} className={cn("min-h-11 w-full justify-start gap-2.5 rounded-xl text-foreground", focusClass)}><Wallet aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> Copy Address</Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => { void enableAgentMode(); closeMenu(); }} className={cn("min-h-11 w-full justify-start gap-2.5 rounded-xl text-foreground", focusClass)}><Bot aria-hidden="true" className="h-4 w-4 text-accent" /> Enable Auto-Agent</Button>
              <div className="my-1 h-px bg-border" />
              <Button variant="ghost" size="sm" type="button" onClick={() => { void onWalletClick(); closeMenu(); }} className={cn("min-h-11 w-full justify-start gap-2.5 rounded-xl text-danger hover:bg-danger/10", focusClass)}><LogOut aria-hidden="true" className="h-4 w-4" /> Disconnect</Button>
            </div>
          </div> : <Button variant="default" size="sm" type="button" onClick={() => { setOpenMenu(null); void onWalletClick(); }} className={cn("min-h-11 gap-2 rounded-xl border-accent bg-accent bg-none px-3 text-accent-foreground hover:bg-accent/90", focusClass)} disabled={connecting} title="Connect MetaMask, Rabby, Coinbase, Brave...">
            <Wallet aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="font-medium" role="status">{connecting ? "Connecting..." : "Connect Wallet"}</span>
          </Button>}
        </div>
      </div>
    </header>
    <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-2xl md:hidden">
      <div className="grid gap-0.5 px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${visibleMobileLinks.length}, minmax(0, 1fr))` }}>
        {visibleMobileLinks.map((link) => {
          const active = isActive(link.href);
          const Icon = link.icon;
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMenu(null)} className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition-colors", focusClass, active ? "bg-accent/10 text-accent ring-1 ring-accent/30" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon aria-hidden="true" className="h-4 w-4" /><span>{link.label}</span></Link>;
        })}
      </div>
    </nav>
  </>;
}
