"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Layers, Route, Send, Shield, Sparkles } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

const tools = [
  { icon: Send, title: "Send", body: "Transfer USDC with a clear review and wallet confirmation." },
  { icon: Layers, title: "Swap", body: "Exchange supported stablecoins without leaving the workspace." },
  { icon: Route, title: "Bridge", body: "Move supported assets between connected testnet networks." },
  { icon: Bot, title: "AI Agent", body: "Describe the task naturally. Review the plan before signing." },
];

const flow = [
  "Connect your wallet and select Arc Testnet",
  "Choose a money action or describe it to the AI agent",
  "Review the exact transaction plan",
  "Confirm in your wallet and track the result",
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-[#101828]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(31,41,55,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(31,41,55,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="pointer-events-none absolute left-1/2 top-16 h-72 w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.14),rgba(34,211,238,0.06),transparent_68%)] blur-2xl" />

      <section className="relative mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pb-20 sm:pt-12">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="mx-auto max-w-5xl text-center">
          <div className="mb-7 flex justify-center">
            <div className="relative flex h-[8.8rem] w-[18rem] items-center justify-center sm:h-44 sm:w-[25rem]">
              <div className="absolute inset-x-8 top-8 h-24 rounded-full bg-white/90 blur-2xl" />
              <Image
                src="/brand/agfusion-main.svg"
                alt="AGFusion"
                width={600}
                height={360}
                priority
                className="relative z-10 h-full w-full object-contain drop-shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
              />
            </div>
          </div>

          <Badge variant="outline" className="mb-5 border-[#d9e1ec] bg-white/80 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#334155] shadow-sm backdrop-blur">
            <Shield className="mr-1.5 h-3 w-3 text-[#315bea]" /> Arc Testnet workspace
          </Badge>

          <h1 className="font-display text-[2.45rem] font-semibold leading-[1.03] tracking-[-0.045em] text-[#0b1220] sm:text-5xl md:text-6xl lg:text-[4.2rem]">
            Programmable money,
            <span className="block bg-gradient-to-r from-[#4f46e5] via-[#2563eb] to-[#06b6d4] bg-clip-text text-transparent">made easier to operate.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-[#5b687a] sm:text-base">
            AGFusion brings sending, swapping, bridging and agent-assisted transactions into one focused interface. The interface stays quiet so the action stays clear.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button asChild size="lg" className="h-14 w-full rounded-2xl border-0 bg-gradient-to-r from-[#4f46e5] via-[#2563eb] to-[#06b6d4] px-8 text-white shadow-[0_14px_32px_rgba(37,99,235,0.22)] transition-transform hover:scale-[1.01] sm:w-auto">
              <Link href="/dashboard">Open workspace <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 w-full rounded-2xl border-[#d8e0ea] bg-white/90 px-8 text-[#172033] shadow-[0_8px_24px_rgba(15,23,42,0.05)] hover:bg-white sm:w-auto">
              <Link href="/dashboard#guide">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-[11px] font-medium text-[#64748b]">Arc Testnet · {AGFUSION_X_HANDLE}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="relative mx-auto mt-12 max-w-5xl">
          <div className="rounded-[1.6rem] border border-[#dfe6ef] bg-white/92 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
            <div className="flex items-center justify-between border-b border-[#e8edf3] pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315bea]">Workspace</p>
                <h2 className="mt-1 text-sm font-semibold text-[#101828]">One place for the actions that matter.</h2>
              </div>
              <span className="hidden rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-medium text-[#64748b] sm:block">Review before signing</span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1.9fr]">
              <div className="rounded-2xl border border-[#e1e7ef] bg-[#f8fafc] p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dbe3ee] bg-white text-[#315bea] shadow-sm"><Sparkles className="h-4 w-4" /></div>
                  <div><p className="text-xs font-semibold text-[#172033]">AI transaction planner</p><p className="text-[10px] text-[#64748b]">Plans first. You approve.</p></div>
                </div>
                <div className="mt-5 rounded-xl border border-[#e1e7ef] bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94a3b8]">Example intent</p>
                  <p className="mt-2 text-xs leading-5 text-[#334155]">“Send 5 USDC to my teammate.”</p>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-[#f1f5f9] px-3 py-2"><span className="text-[10px] font-medium text-[#64748b]">Plan ready</span><span className="text-[10px] font-semibold text-[#315bea]">Review</span></div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {tools.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dbe3ee] bg-[#f8fafc] text-[#315bea]"><Icon className="h-4 w-4" /></div>
                    <p className="mt-5 text-xs font-semibold text-[#172033]">{title}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[#64748b]">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mx-auto mt-3 grid max-w-5xl grid-cols-2 gap-2 sm:grid-cols-4">
          {[['USDC', 'Native fee asset'], ['EVM', 'Builder friendly'], ['<1s', 'Fast finality'], ['Testnet', 'Safe practice']].map(([value, label]) => (
            <div key={label} className="rounded-xl border border-[#e1e7ef] bg-white/90 px-3 py-4 text-center shadow-sm">
              <div className="text-lg font-semibold text-[#101828] sm:text-xl">{value}</div>
              <div className="mt-1 text-[10px] font-medium text-[#64748b]">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative border-y border-[#e3e8ef] bg-white/65">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[0.75fr_1.25fr] md:items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315bea]">Simple flow</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#101828] sm:text-3xl">Intent to confirmation without the clutter.</h2>
              <p className="mt-3 text-sm leading-6 text-[#64748b]">Every important step stays visible. No decorative layer should compete with the transaction itself.</p>
            </div>
            <div className="space-y-2">
              {flow.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-xl border border-[#e1e7ef] bg-white px-3.5 py-3 shadow-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[10px] font-mono font-semibold text-[#315bea]">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-xs font-medium text-[#334155]">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
        <div className="mx-auto max-w-xl">
          <Image src="/brand/agfusion-main.svg" alt="AGFusion" width={360} height={216} className="mx-auto h-auto w-48 object-contain drop-shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:w-56" />
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[#101828]">Quiet interface. Strong identity.</h2>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">The AGFusion mark carries the purple-to-cyan fusion identity while the product UI stays restrained, compact and easy to scan.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild variant="outline" className="border-[#d8e0ea] bg-white text-[#172033]"><Link href="/dashboard">Enter AGFusion <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
            <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-xs font-semibold text-[#64748b] hover:bg-white hover:text-[#172033]">{AGFUSION_X_HANDLE}</a>
          </div>
        </div>
      </section>
    </main>
  );
}
