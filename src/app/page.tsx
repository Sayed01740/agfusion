import Link from "next/link";
import { 
  ArrowRight, 
  ArrowUpRight, 
  ShieldCheck, 
  Layers, 
  Zap, 
  CheckCircle2, 
  Globe,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARC_CHAIN_ID, ARC_NETWORK_NAME } from "@/lib/arc-chain";

const METRICS = [
  { label: "Target Network", value: ARC_NETWORK_NAME, sub: `Chain ID ${ARC_CHAIN_ID}` },
  { label: "Native Fee Asset", value: "USDC", sub: "Gas paid directly in USDC" },
  { label: "Settlement Speed", value: "< 1s", sub: "Fast finality on Arc" },
  { label: "Cross-Chain Support", value: "EVM + CCTP", sub: "Arc, Base & Ethereum" },
];

export default function LandingPage() {
  return (
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 pt-4">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO
         ───────────────────────────────────────────────────────────── */}
      <section 
        className="flex flex-col items-center text-center py-12 sm:py-20 lg:py-24 max-w-4xl mx-auto" 
        aria-labelledby="hero-title"
      >
        {/* Status Indicator Pill */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          <span className="font-mono">{ARC_NETWORK_NAME} Live</span>
        </div>

        {/* Main Display Headline */}
        <h1 
          id="hero-title" 
          className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[1.08] tracking-tight text-foreground font-display"
        >
          Autonomous AI Infrastructure for <br className="hidden sm:inline" />
          <span className="text-gradient-pro">Modern Web3.</span>
        </h1>

        {/* Subtitle Value Proposition */}
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Transform complex multi-chain liquidity, cross-chain swaps, and treasury operations into verified, non-custodial transactions. Zero slippage routing and instant finality on {ARC_NETWORK_NAME}.
        </p>

        {/* CTA Cluster */}
        <div className="mt-8 flex flex-col gap-3.5 sm:flex-row justify-center">
          <Button asChild size="lg" className="shimmer-button active-tactile min-h-12 px-8 text-base font-semibold shadow-lg shadow-accent/20 cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90">
            <Link href="/dashboard" className="flex items-center gap-2">
              Launch App Console <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="active-tactile min-h-12 px-6 border-white/10 hover:border-accent/40 bg-card/60 backdrop-blur-md cursor-pointer">
            <Link href="/docs" className="flex items-center gap-2 text-foreground">
              Protocol Docs <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Micro Assurance */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-accent shrink-0" />
            100% Non-Custodial (No Seed Storage)
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-accent shrink-0" />
            Pre-Flight Verification
          </span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: TELEMETRY & PROTOCOL METRICS
         ───────────────────────────────────────────────────────────── */}
      <section aria-label="Protocol Telemetry" className="my-8 card-pro py-8 px-6 glow-border">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:gap-8">
          {METRICS.map((metric) => (
            <div key={metric.label} className="flex flex-col">
              <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{metric.label}</span>
              <span className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl text-gradient-pro">
                {metric.value}
              </span>
              <span className="mt-1 text-xs text-muted-foreground/80">{metric.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: ECOSYSTEM PARTNERS MARQUEE
         ───────────────────────────────────────────────────────────── */}
      <section aria-label="Ecosystem Partners" className="my-12 border-t border-white/10 py-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 font-mono mb-6">
          Powered by Industry-Leading Web3 Primitives
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-70 grayscale hover:grayscale-0 transition-all duration-300">
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <Globe className="h-4 w-4 text-accent" /> Arc Network
          </div>
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <ShieldCheck className="h-4 w-4 text-accent" /> Circle Programmable Wallets
          </div>
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <Sliders className="h-4 w-4 text-accent" /> Reown AppKit
          </div>
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <Zap className="h-4 w-4 text-accent" /> ZeroDev Account Abstraction
          </div>
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <Layers className="h-4 w-4 text-accent" /> Circle CCTP
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: CONVERSION CALL-TO-ACTION COCKPIT
         ───────────────────────────────────────────────────────────── */}
      <section 
        aria-labelledby="cta-heading" 
        className="relative my-8 overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-br from-card via-[#070a0e] to-card/90 p-8 text-center shadow-2xl sm:p-14 glow-border card-pro"
      >
        <div className="relative z-10 mx-auto max-w-2xl">
          <span className="rounded-full border border-accent/30 bg-accent/15 px-3.5 py-1 text-xs font-semibold text-accent font-mono shadow-xs shadow-accent/20">
            Get Started on {ARC_NETWORK_NAME}
          </span>
          <h2 id="cta-heading" className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl font-display text-gradient-pro">
            Experience the Future of Web3 Intelligence.
          </h2>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg leading-relaxed">
            Deploy autonomous intent workflows, manage multi-chain stablecoin balances, and execute non-custodial transactions in one unified workspace.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="shimmer-button active-tactile min-h-12 px-8 text-base font-semibold shadow-xl shadow-accent/25 cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href="/dashboard" className="flex items-center gap-2">
                Open Workspace Console <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="active-tactile min-h-12 px-6 border-white/15 bg-background/60 hover:border-accent/40 backdrop-blur-md cursor-pointer">
              <Link href="/docs" className="flex items-center gap-2">
                Developer Docs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-accent" />
            100% Non-custodial • Client approval required • Verifiable execution
          </p>
        </div>
      </section>
    </div>
  );
}
