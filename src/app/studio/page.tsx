"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Code2, Copy, Check, Rocket, Search } from "lucide-react";
import { CODE_TEMPLATES } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Curated from Arc Build / Arc House / X sample apps */
const DOCS = [
  { title: "Welcome to Arc docs", url: "https://docs.arc.io" },
  { title: "Connect to Arc", url: "https://docs.arc.io/arc/references/connect-to-arc" },
  { title: "Gas and fees (USDC)", url: "https://docs.arc.io/arc/references/gas-and-fees" },
  { title: "Build on Arc", url: "https://docs.arc.io/build" },
  { title: "Agentic economy", url: "https://docs.arc.io/build/agentic-economy" },
  { title: "Register AI agent (ERC-8004)", url: "https://docs.arc.io/arc/tutorials/register-your-first-ai-agent" },
  { title: "ERC-8183 job escrow", url: "https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job" },
  { title: "Arc escrow sample", url: "https://github.com/circlefin/arc-escrow" },
  { title: "Circle OOAK", url: "https://github.com/circlefin/circle-ooak" },
  { title: "x402 for agents", url: "https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents" },
  { title: "Circle Skills deploy", url: "https://www.circle.com/blog/from-prompt-to-deployment-with-circle-skills-and-vercel-skills" },
  { title: "Unified balance", url: "https://docs.arc.io/app-kit/unified-balance" },
  { title: "Arc House", url: "https://community.arc.io" },
  { title: "Open source showcase", url: "https://arc-showcase.thecanteenapp.com" },
];

export default function StudioPage() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(CODE_TEMPLATES[0].id);
  const [copied, setCopied] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return CODE_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.includes(q),
    );
  }, [query]);

  const active =
    filtered.find((t) => t.id === activeId) || filtered[0] || CODE_TEMPLATES[0];

  async function copyCode() {
    await navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function simulateDeploy() {
    setDeployLog([]);
    const lines = [
      "→ Foundry/Viem deploy target: Arc Testnet (5042002)",
      "→ RPC https://rpc.testnet.arc.network",
      "→ Gas token: USDC (18 decimals)",
      "→ Compiling contract…",
      "→ Estimating deployment fee… ~0.04 USDC",
      "→ Broadcasting transaction…",
      "✓ Deployed 0xArcC0n7rac70000000000000000000000001",
      "✓ Verified on https://testnet.arcscan.app",
    ];
    lines.forEach((line, i) => {
      setTimeout(() => {
        setDeployLog((prev) => [...prev, line]);
      }, i * 350);
    });
  }

  async function runSnippetLive() {
    setRunning(true);
    setRunLog(["→ Resolving template capability…"]);
    try {
      const { executeSend, executeBridge, executeSwap } = await import(
        "@/lib/client-actions"
      );
      if (active.category === "send" || active.category === "component") {
        const { getInjectedProvider, requestAccounts } = await import(
          "@/sdk/wallet-adapter"
        );
        const provider = await getInjectedProvider();
        const accounts = await requestAccounts(provider);
        const self = accounts[0];
        if (!self) {
          throw new Error("Connect wallet first — Studio send is live-only.");
        }
        setRunLog((l) => [
          ...l,
          "→ executeSend on Arc_Testnet (live, self-transfer 0.05 USDC)",
        ]);
        const tx = await executeSend({
          amount: "0.05",
          token: "USDC",
          chain: "Arc_Testnet",
          recipient: self,
          recipientLabel: "Studio self-transfer",
          preferLive: true,
        });
        setRunLog((l) => [
          ...l,
          `✓ ${tx.executionMode || "live"} · ${tx.status} · ${tx.txHash || "no hash"}`,
          tx.explorerUrl ? `→ ${tx.explorerUrl}` : "",
        ]);
      } else if (active.category === "bridge" || active.category === "unified") {
        setRunLog((l) => [...l, "→ executeBridge Arc → Base (live)"]);
        const tx = await executeBridge({
          amount: "1",
          fromChain: "Arc_Testnet",
          toChain: "Base_Sepolia",
          preferLive: true,
        });
        setRunLog((l) => [
          ...l,
          `✓ ${tx.executionMode || "live"} · ${tx.status}`,
        ]);
      } else if (active.category === "swap") {
        setRunLog((l) => [...l, "→ executeSwap USDC → EURC (live)"]);
        const tx = await executeSwap({
          amount: "1",
          tokenIn: "USDC",
          tokenOut: "EURC",
          chain: "Arc_Testnet",
        });
        setRunLog((l) => [
          ...l,
          `✓ ${tx.executionMode || "live"} · ${tx.status}`,
        ]);
      } else {
        setRunLog((l) => [
          ...l,
          "→ Contract templates: Deploy assistant is a local simulation (not on-chain)",
        ]);
      }
    } catch (e) {
      setRunLog((l) => [
        ...l,
        `✗ ${e instanceof Error ? e.message : "Run failed"}`,
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Code2 className="h-6 w-6 text-cyan-400" />
          Developer studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Code templates and Arc Build references — send, bridge, contracts, and
          agent patterns for Arc Testnet
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search templates, bridge, swap…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "w-full text-left rounded-xl border px-3 py-3 transition",
                  active?.id === t.id
                    ? "border-cyan-500/40 bg-cyan-500/10"
                    : "border-white/5 bg-white/[0.02] hover:border-white/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">
                    {t.title}
                  </span>
                  <Badge variant="outline">{t.category}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.description}</p>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-400" />
                Arc Build & House resources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {DOCS.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-cyan-300/90 hover:text-cyan-200 py-1"
                >
                  {d.title} ↗
                </a>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-white/5">
              <div>
                <CardTitle className="text-base">{active.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {active.description}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void runSnippetLive()} disabled={running}>
                  {running ? "Running…" : "Run on Arc"}
                </Button>
                <Button size="sm" variant="secondary" onClick={copyCode}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="overflow-x-auto p-5 text-[12.5px] leading-relaxed font-mono text-cyan-50/90 bg-slate-950/50 max-h-[480px] scrollbar-thin">
                <code>{active.code}</code>
              </pre>
              {runLog.length > 0 && (
                <div className="border-t border-white/5 p-3 font-mono text-[11px] space-y-1 bg-slate-950/80">
                  {runLog.filter(Boolean).map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith("✓")
                          ? "text-emerald-400"
                          : line.startsWith("✗")
                            ? "text-red-400"
                            : "text-slate-400"
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Rocket className="h-4 w-4 text-emerald-400" />
                Contract deployment assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Walks through a Foundry/Viem-style deploy to Arc Testnet (chain
                5042002, USDC gas). Keep private keys server-side only.
              </p>
              <Button size="sm" onClick={simulateDeploy}>
                Preview ERC-20 deploy
              </Button>
              {deployLog.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[12px] space-y-1">
                  {deployLog.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={
                        line.startsWith("✓")
                          ? "text-emerald-400"
                          : "text-slate-400"
                      }
                    >
                      {line}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
