"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Bridge, Layers, Send, Shield, Sparkles, Wallet } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AGFUSION_X_HANDLE, AGFUSION_X_URL } from "@/lib/social";

const tools = [
  { icon: Send, title: "Send", body: "Transfer USDC with a clear review and wallet confirmation." },
  { icon: Layers, title: "Swap", body: "Exchange supported stablecoins without leaving the workspace." },
  { icon: Bridge, title: "Bridge", body: "Move supported assets between connected testnet networks." },
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
    <main className="relative overflow-hidden">
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="mx-auto max-w-4xl text-center">
          <div className="mb-7 flex justify-center">
            <div className="relative flex h-32 w-[21rem] items-center justify-center sm:h-36 sm:w-[25rem]">
              <div className="absolute inset-x-12 top-8 h-20 rounded-full bg-violet-500/10 blur-3xl" />
              <Image src="/brand/agfusion-main.svg" alt="AGFusion" width={600} height={360} priority className="relative h-full w-full object-contain" />
            </div>
          </div>

          <Badge variant="outline" className="mb-5 px-3 py-1 text-[10px] uppercase tracking-[0.16em]">
            <Shield className="mr-1.5 h-3 w-3" /> Arc Testnet workspace
          </Badge>

          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-slate-100 sm:text-5xl md:text-6xl">
            Programmable money,
            <span className="block text-gradient-brand">made easier to operate.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
            AGFusion brings sending, swapping, bridging and agent-assisted transactions into one focused interface. The interface stays quiet so the action stays clear.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard">Open workspace <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/dashboard#guide">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-slate-600">Arc Testnet · {AGFUSION_X_HANDLE}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="mx-auto mt-12 max-w-5xl">
          <div className="surface-card rounded-[1.5rem] p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <p className="section-label">Workspace</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-100">One place for the actions that matter.</h2>
              </div>
              <span className="hidden rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] text-slate-600 sm:block">Review before signing</span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1.9fr]">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-slate-200"><Sparkles className="h-4 w-4" /></div>
                  <div><p className="text-xs font-semibold text-slate-100">AI transaction planner</p><p className="text-[10px] text-slate-600">Plans first. You approve.</p></div>
                </div>
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-700">Example intent</p>
                  <p className="mt-2 text-xs leading-5 text-slate-300">“Send 5 USDC to my teammate.”</p>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.035] px-3 py-2"><span className="text-[10px] text-slate-600">Plan ready</span><span className="text-[10px] font-semibold text-slate-300">Review</span></div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {tools.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.014] p-4 transition-transform duration-300 hover:-translate-y-0.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-slate-300"><Icon className="h-4 w-4" /></div>
                    <p className="mt-5 text-xs font-semibold text-slate-100">{title}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-600">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mx-auto mt-3 grid max-w-5xl grid-cols-2 gap-2 sm:grid-cols-4">
          {[['USDC', 'Native fee asset'], ['EVM', 'Builder friendly'], ['<1s', 'Fast finality'], ['Testnet', 'Safe practice']].map(([value, label]) => (
            <div key={label} className="surface-card rounded-xl px-3 py-4 text-center">
              <div className="text-lg font-semibold text-slate-100 sm:text-xl">{value}</div>
              <div className="mt-1 text-[10px] text-slate-600">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/[0.05] bg-white/[0.012]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[0.75fr_1.25fr] md:items-start">
            <div>
              <p className="section-label">Simple flow</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Intent to confirmation without the clutter.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Every important step stays visible. No decorative layer should compete with the transaction itself.</p>
            </div>
            <div className="space-y-2">
              {flow.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.014] px-3.5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[10px] font-mono font-semibold text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-xs font-medium text-slate-300">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
        <div className="mx-auto max-w-xl">
          <Image src="/brand/agfusion-mark.svg" alt="AGFusion mark" width={80} height={80} className="mx-auto h-12 w-12 object-contain" />
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-100">Quiet interface. Strong identity.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">The new AGFusion mark carries the purple-to-cyan fusion identity while the product UI stays restrained, compact and easy to scan.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline"><Link href="/dashboard">Enter AGFusion <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
            <a href={AGFUSION_X_URL} target="_blank" rel="noopener noreferrer me" className="inline-flex h-10 items-center rounded-xl px-4 text-xs font-semibold text-slate-500 hover:bg-white/[0.04] hover:text-slate-200">{AGFUSION_X_HANDLE}</a>
          </div>
        </div>
      </section>
    </main>
  );
}
