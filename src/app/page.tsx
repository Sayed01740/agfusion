import Link from "next/link";
import { 
  ArrowRight, 
  ArrowUpRight, 
  Bot, 
  ShieldCheck, 
  Cpu, 
  Layers, 
  Route, 
  Send, 
  Zap, 
  Lock, 
  Terminal, 
  Activity, 
  Sparkles, 
  CheckCircle2, 
  Globe,
  Sliders
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCockpit } from "@/components/landing/hero-cockpit";
import { DeveloperTerminal } from "@/components/landing/developer-terminal";

const CAPABILITIES = [
  {
    icon: Bot,
    number: "01",
    title: "Autonomous Agent Engine",
    description: "Converts conversational natural language into typed EIP-712 execution intents without manual parameter calculation.",
    badge: "AI-Powered",
  },
  {
    icon: Lock,
    number: "02",
    title: "Non-Custodial Abstraction",
    description: "Integrated with Circle Programmable Wallets and ZeroDev ERC-4337. Private keys never touch any centralized servers.",
    badge: "Zero-Knowledge",
  },
  {
    icon: Route,
    number: "03",
    title: "Cross-Chain Liquidity Substrate",
    description: "Native Circle CCTP stablecoin bridging across Arc Testnet, Base, Arbitrum, and EVM testnets with zero wrapped asset risk.",
    badge: "Multi-Chain",
  },
  {
    icon: Zap,
    number: "04",
    title: "Predictive Gas & Slippage Oracles",
    description: "Pre-execution mempool simulation algorithms predict congestion to lock in exact routing rates and prevent transaction revert.",
    badge: "Sub-Second",
  },
  {
    icon: ShieldCheck,
    number: "05",
    title: "Cryptographic Audit Trails",
    description: "Every plan produces a human-readable diff, state change simulation, and verifiable cryptographic execution receipt.",
    badge: "Formally Verified",
  },
  {
    icon: Cpu,
    number: "06",
    title: "Headless Developer SDK",
    description: "Integrate autonomous on-chain intent routing into your decentralized application with less than 5 lines of TypeScript.",
    badge: "API & Hooks",
  },
];

const METRICS = [
  { label: "Total Simulated Volume", value: "$148.5M+", sub: "Across Arc & EVM Testnets" },
  { label: "Execution Finality", value: "< 850ms", sub: "Arc Substrate Consensus" },
  { label: "Multi-Chain Substrates", value: "5+ Networks", sub: "Arc, Base, Arbitrum, OP, Sepolia" },
  { label: "Simulation Accuracy", value: "99.98%", sub: "Zero Reverted Signatures" },
];

const ARCHITECTURE_STEPS = [
  {
    step: "01",
    title: "Intent Parsing & Disambiguation",
    desc: "User expresses goals via UI or API. The multi-model agent maps intents to deterministic smart contract signatures.",
    tag: "Client-Side Ingestion"
  },
  {
    step: "02",
    title: "State Simulation & Safety Guard",
    desc: "Pre-flight RPC calls verify gas overhead, address hygiene, and slippage thresholds before prompting any wallet.",
    tag: "Formal Verification"
  },
  {
    step: "03",
    title: "Atomic On-Chain Settlement",
    desc: "User approves via Web3 wallet. Arc Substrate settles the transaction with sub-second finality and cryptographic proof.",
    tag: "Substrate Finality"
  }
];

export default function LandingPage() {
  return (
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 pt-4">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO WITH LIVE AGENT INTENT COCKPIT
         ───────────────────────────────────────────────────────────── */}
      <section 
        className="grid items-center gap-12 py-8 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:py-20" 
        aria-labelledby="hero-title"
      >
        <div>
          {/* Status Indicator Pill */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            <span className="font-mono">Arc Substrate & Multi-Chain EVM v2.4 Live</span>
          </div>

          {/* Main Display Headline */}
          <h1 
            id="hero-title" 
            className="text-[clamp(2.5rem,5.2vw,4.5rem)] font-bold leading-[1.06] tracking-tight text-foreground font-display"
          >
            Autonomous AI Infrastructure for <br className="hidden sm:inline" />
            <span className="text-gradient-pro">Modern Web3.</span>
          </h1>

          {/* Subtitle Value Proposition */}
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Transform complex multi-chain liquidity, cross-chain swaps, and treasury operations into verified, non-custodial transactions. Zero slippage routing and instant finality on Arc Testnet.
          </p>

          {/* CTA Cluster */}
          <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
            <Button asChild size="lg" className="shimmer-button active-tactile min-h-12 px-7 text-base font-semibold shadow-lg shadow-accent/20 cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href="/dashboard" className="flex items-center gap-2">
                Launch App Console <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="active-tactile min-h-12 px-6 border-white/10 hover:border-accent/40 bg-card/60 backdrop-blur-md cursor-pointer">
              <Link href="#architecture" className="flex items-center gap-2 text-foreground">
                Protocol Architecture <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Micro Assurance */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-accent shrink-0" />
              100% Non-Custodial (No Seed Storage)
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-accent shrink-0" />
              Formal Pre-Flight Verification
            </span>
          </div>
        </div>

        {/* Right Hero: Interactive Cockpit */}
        <div>
          <HeroCockpit />
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
          SECTION 3: 6-CARD CAPABILITIES SHOWCASE
         ───────────────────────────────────────────────────────────── */}
      <section id="capabilities" aria-labelledby="capabilities-title" className="py-14 sm:py-20">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent font-mono">
              Engine Architecture
            </p>
            <h2 id="capabilities-title" className="mt-2.5 text-3xl font-bold text-foreground sm:text-4xl font-display">
              Engineered for Autonomous Execution.
            </h2>
          </div>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline cursor-pointer"
          >
            Access interactive tools <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, number, title, description, badge }) => (
            <div 
              key={title} 
              className="group card-pro p-6 glow-border transition-all duration-300 hover:border-accent/40 hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/25 transition-all group-hover:bg-accent/20 group-hover:scale-105 shadow-sm shadow-accent/10">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-mono font-medium text-accent">
                    {badge}
                  </span>
                  <span className="font-mono text-xs font-semibold text-muted-foreground/60">{number}</span>
                </div>
              </div>

              <h3 className="mt-6 text-lg font-semibold text-foreground transition-colors group-hover:text-accent font-display">
                {title}
              </h3>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: ARCHITECTURE PIPELINE ("INTENT TO FINALITY")
         ───────────────────────────────────────────────────────────── */}
      <section id="architecture" aria-labelledby="arch-title" className="border-t border-white/10 py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent font-mono">
            Deterministic Pipeline
          </p>
          <h2 id="arch-title" className="mt-2 text-3xl font-bold text-foreground sm:text-4xl font-display">
            From Natural Intent to Sub-Second Finality.
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Eliminating blind signing and failed transactions. Every prompt traverses an audited, multi-layer consensus pipeline before requesting client signature.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {ARCHITECTURE_STEPS.map((item, idx) => (
            <div 
              key={item.step} 
              className="relative rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-xl glow-border flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-bold text-accent">{item.step}</span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                    {item.tag}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-foreground font-display">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.desc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-1.5 text-xs text-accent">
                <CheckCircle2 className="h-3.5 w-3.5" /> Stage {idx + 1} Automated
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: DEVELOPER TERMINAL & HEADLESS SDK
         ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="developer-title" className="border-t border-white/10 py-16 sm:py-20">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent font-mono">
              Developer Substrate
            </p>
            <h2 id="developer-title" className="mt-2.5 text-3xl font-bold text-foreground sm:text-4xl font-display">
              Build with the Autonomous Agent SDK.
            </h2>
          </div>
          <Link 
            href="/dashboard#tools" 
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline cursor-pointer"
          >
            Explore API Documentation <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <DeveloperTerminal />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 6: ECOSYSTEM SUBSTRATE MARQUEE
         ───────────────────────────────────────────────────────────── */}
      <section aria-label="Ecosystem Partners" className="my-8 border-t border-white/10 py-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 font-mono mb-6">
          Powered by Industry-Leading Web3 Primitives
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-70 grayscale hover:grayscale-0 transition-all duration-300">
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-foreground tracking-wide">
            <Globe className="h-4 w-4 text-accent" /> Arc Substrate
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
          SECTION 7: CONVERSION CALL-TO-ACTION COCKPIT
         ───────────────────────────────────────────────────────────── */}
      <section 
        aria-labelledby="cta-heading" 
        className="relative my-8 overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-br from-card via-[#070a0e] to-card/90 p-8 text-center shadow-2xl sm:p-14 glow-border card-pro"
      >
        <div className="relative z-10 mx-auto max-w-2xl">
          <span className="rounded-full border border-accent/30 bg-accent/15 px-3.5 py-1 text-xs font-semibold text-accent font-mono shadow-xs shadow-accent/20">
            Get Started on Arc Testnet
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
              <Link href="/dashboard#guide" className="flex items-center gap-2">
                Getting Started Guide <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Zero centralized custody • Formal verification active • Fully auditable
          </p>
        </div>
      </section>
    </div>
  );
}
