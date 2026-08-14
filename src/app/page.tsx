"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Code2,
  Gauge,
  Layers,
  Send as SendIcon,
  Shield,
  Sparkles,
  Timer,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

/** Features in plain language for first-time users */
const capabilities = [
  {
    icon: SendIcon,
    title: "Send USDC",
    body: "Pay another wallet on Arc. Paste a full 0x address, pick an amount, confirm in your wallet.",
  },
  {
    icon: Sparkles,
    title: "AI helper (agent)",
    body: "Type what you want in normal English. The agent plans the steps — money only moves after you Confirm.",
  },
  {
    icon: Layers,
    title: "Swap USDC ↔ EURC",
    body: "Change dollar-stablecoin into euro-stablecoin (or back) on Arc without another app.",
  },
  {
    icon: Timer,
    title: "Bridge across chains",
    body: "Move USDC between Arc and Base (and similar testnets) when funds need to live on another network.",
  },
  {
    icon: Wallet,
    title: "Fees in USDC",
    body: "On Arc, network fees are paid in USDC — no separate “gas token” to learn first.",
  },
  {
    icon: Code2,
    title: "For builders too",
    body: "Studio has code samples and Arc docs. Agents page covers advanced identity registration.",
  },
];

/** Network highlights from Arc public testnet messaging */
const networkStats = [
  { label: "Avg. weekly tx cost", value: "~$0.04", hint: "USDC gas" },
  { label: "Finality", value: "<1s", hint: "Deterministic" },
  { label: "Compatibility", value: "EVM", hint: "Solidity-ready" },
  { label: "Status", value: "Testnet", hint: "Public" },
];

const productFlow = [
  "Connect your wallet (e.g. Rabby) and select Arc Testnet",
  "Get free test USDC from the Circle faucet",
  "Pick one action: Send, Swap, Bridge — or type it in chat",
  "Read the plan → press Confirm → approve in the wallet popup",
  "See the result in Activity and on ArcScan",
];

const useCases = [
  {
    title: "Pay someone in USDC",
    body: "Simple transfer to a wallet address you trust — practice with test money first.",
  },
  {
    title: "Change currency (stablecoins)",
    body: "Swap between USDC and EURC when you need euro-denominated stablecoins.",
  },
  {
    title: "Move funds to another network",
    body: "Bridge when your USDC is on the wrong chain for an app or teammate.",
  },
  {
    title: "Learn Arc as a builder",
    body: "Use Studio + Agents pages to explore App Kit, identity, and agent patterns.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 sm:pt-24 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center animate-fade-up"
        >
          <div className="mb-8 flex justify-center">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-cyan-500/30 blur-[60px] rounded-full animate-pulse z-0" />
              <Image
                src="/logo-light.png"
                alt="AGFusion"
                width={120}
                height={120}
                priority
                className="relative h-[6.5rem] w-[6.5rem] sm:h-32 sm:w-32 rounded-3xl object-contain shadow-[0_0_50px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/30 z-10 hover:scale-105 transition-transform duration-500 animate-float"
              />
            </div>
          </div>
          <Badge variant="cyan" className="mb-7 gap-1.5 px-3.5 py-1.5 shadow-lg shadow-cyan-500/10">
            <Shield className="h-3 w-3" />
            Free testnet app · real wallet practice · not a bank
          </Badge>
          <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tighter sm:text-5xl md:text-6xl lg:text-[4.5rem]">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-300 to-indigo-400">
              Send, swap, and move USDC
            </span>
            <br />
            <span className="text-slate-100">without juggling five apps</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            <strong className="font-semibold text-slate-200">AGFusion</strong> is
            the clean control panel for digital dollars on{" "}
            <span className="text-arc font-semibold">Arc</span> — the Economic
            OS for programmable money. Connect a wallet, get free test USDC, then
            pay or convert. The AI plans; you always Confirm.
          </p>
          <div className="mt-11 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-[200px] h-14 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold text-base shadow-[0_0_25px_rgba(34,211,238,0.4)] transition-all duration-300 hover:scale-[1.03] border border-cyan-400/50 animate-pulse-ring">
              <Link href="/dashboard">
                Start here — open app
                <ArrowRight className="h-5 w-5 ml-2" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto sm:min-w-[200px]">
              <Link href="/dashboard#guide">How do I use this?</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto sm:min-w-[200px]">
              <a
                href={AGFUSION_X_URL}
                target="_blank"
                rel="noopener noreferrer me"
              >
                Follow on X · {AGFUSION_X_HANDLE}
              </a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Arc Testnet ·{" "}
            <a
              href={AGFUSION_X_URL}
              target="_blank"
              rel="noopener noreferrer me"
              className="text-cyan-400/90 hover:text-cyan-300"
            >
              {AGFUSION_X_HANDLE}
            </a>{" "}
            ·{" "}
            <a
              href="https://docs.arc.io"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400/90 hover:text-cyan-300"
            >
              docs.arc.io
            </a>{" "}
            ·{" "}
            <a
              href="https://community.arc.io"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400/90 hover:text-cyan-300"
            >
              Arc House
            </a>
          </p>
        </motion.div>

        {/* Dashboard map — reduce “I don’t know where to click” */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto mt-14 max-w-3xl perspective-1000"
        >
          <div className="glass-ultra rounded-2xl p-5 sm:p-6 group hover:-translate-y-1 transition-all duration-500">
            <p className="section-label mb-3">Inside the app</p>
            <h2 className="text-lg font-semibold text-slate-50">
              Two columns — that’s the whole workspace
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
                <p className="text-sm font-semibold text-cyan-50">Left · AI agent</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
                  Type what you want. The agent plans; you Confirm. Nothing
                  moves without your wallet signature.
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                <p className="text-sm font-semibold text-blue-50">
                  Right · Money tools
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
                  Clear tabs: <strong className="text-slate-300">Send</strong>,{" "}
                  <strong className="text-slate-300">Swap</strong>,{" "}
                  <strong className="text-slate-300">Bridge</strong>, and{" "}
                  <strong className="text-slate-300">More</strong> for advanced.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Product flow card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto mt-10 max-w-3xl"
        >
          <div className="glass-ultra glow-border rounded-3xl p-1 transition-all duration-500 hover:scale-[1.01]">
            <div className="rounded-[1.35rem] bg-gradient-to-b from-slate-950/90 to-slate-950/70 p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500 mb-6">
                <span className="section-label">Payment flow</span>
                <Badge variant="outline" className="font-normal">
                  Live on Arc Testnet
                </Badge>
              </div>
              <div className="space-y-2.5">
                {productFlow.map((step, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 hover:border-cyan-500/20 hover:bg-cyan-500/[0.04] transition-colors"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/25 to-blue-500/15 text-xs font-mono font-semibold text-cyan-200 ring-1 ring-cyan-400/20">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-200 font-medium">{step}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Network stats */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {networkStats.map((s) => (
            <div
              key={s.label}
              className="glass rounded-2xl px-4 py-5 text-center border border-white/5"
            >
              <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-slate-100">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-slate-400">{s.label}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-600">
                {s.hint}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-600">
          Network characteristics reflect Arc public materials (USDC gas,
          sub-second finality, EVM). Cost figures are illustrative of testnet
          messaging.
        </p>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Purpose-built for real-world financial flows
          </h2>
          <p className="mt-2 text-slate-400 text-sm max-w-xl mx-auto">
            Arc is engineered for enterprise-grade, stablecoin-native value
            movement. AGFusion puts that foundation to work for operators and
            builders.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="glass-ultra rounded-2xl p-5 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(34,211,238,0.15)] group"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-teal-300 shadow-[0_0_15px_rgba(94,234,212,0.2)] group-hover:scale-110 transition-transform duration-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-medium text-slate-100">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {f.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Use cases — Arc Build / arc.io themes */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge variant="outline" className="mb-3">
                Arc use cases
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Economic activity on a stablecoin-native L1
              </h2>
              <p className="mt-2 text-sm text-slate-400 max-w-lg">
                From Arc’s public vision: payments, treasury, FX, and agentic
                commerce — with predictable dollar-based costs.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a
                href="https://docs.arc.io/build"
                target="_blank"
                rel="noreferrer"
              >
                Arc Build docs
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {useCases.map((u) => (
              <div
                key={u.title}
                className="rounded-2xl border border-white/8 bg-slate-950/40 p-5"
              >
                <h3 className="text-sm font-medium text-slate-100">{u.title}</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Arc House / builders strip */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <Badge variant="outline" className="mb-3">
              Arc House
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Built with the Architect community
            </h2>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Arc House is the global network of builders developing the
              Economic OS for the internet — events, open-source showcases, and
              builder spotlights around programmable money and USDC settlement
              on Arc.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="sm" variant="secondary">
                <a
                  href="https://community.arc.io"
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit Arc House
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a
                  href="https://www.circle.com/blog/introducing-the-arc-builders-fund"
                  target="_blank"
                  rel="noreferrer"
                >
                  Arc Builders Fund
                </a>
              </Button>
            </div>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Gauge className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Developer studio
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Snippets aligned with Arc Build quickstarts: connect RPC,
                  send USDC, bridge liquidity, deploy contracts, and register
                  AI agents (ERC-8004).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Privacy when you need it
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Arc supports opt-in privacy with auditability — designed for
                  compliance-ready financial applications.
                </p>
              </div>
            </div>
            <pre className="rounded-xl border border-white/10 bg-slate-950/70 p-4 text-[11px] font-mono text-cyan-100/85 overflow-x-auto leading-relaxed">
{`// Arc Testnet · USDC as gas
const chainId = 5042002
const rpc = "https://rpc.testnet.arc.network"

// Send native USDC on Arc
await wallet.sendTransaction({
  to: recipient,
  value: parseUnits(amount, 18),
})`}
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20 text-center border-t border-white/5">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Run stablecoin workflows on Arc
        </h2>
        <p className="mt-3 text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
          Connect your wallet, fund test USDC from the Circle faucet, and use
          AGFusion for payments, analytics, agents, and developer tooling.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/dashboard">
            Enter workspace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
