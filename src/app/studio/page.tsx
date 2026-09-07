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
    filtered.find((t) => t.id === activeId) || filtered[0];
  const hasLiveSample = active && ["send", "component", "bridge", "unified", "swap"].includes(active.category);
  const sampleDescription = active?.category === "send" || active?.category === "component"
    ? "Built-in sample: self-transfer 0.05 USDC on Arc Testnet."
    : active?.category === "bridge" || active?.category === "unified"
      ? "Built-in sample: bridge 1 USDC from Arc Testnet to Base Sepolia."
      : active?.category === "swap"
        ? "Built-in sample: swap 1 USDC to EURC on Arc Testnet."
        : "No live sample action for this template. Use the local deployment simulation below to preview a deploy flow.";

  async function copyCode() {
    if (!active) return;
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
    if (!active) return;
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-start gap-2 text-foreground">
          <Code2 aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-accent" />
          <span className="min-w-0 break-words">Developer studio</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Code templates and Arc Build references — send, bridge, contracts, and
          agent patterns for Arc Testnet
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <div className="min-w-0 lg:col-span-4 space-y-4">
          <label htmlFor="template-search" className="block text-sm font-medium text-foreground">Search templates</label>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="template-search"
              type="search"
              className="pl-9 border-border bg-muted text-foreground"
              placeholder="Search templates, bridge, swap…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
            {filtered.length === 0 && <p role="status" className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">No templates match your search. Try another term or clear the search.</p>}
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                aria-pressed={active?.id === t.id}
                className={cn(
                  "w-full text-left rounded-xl border px-3 py-3 transition",
                  active?.id === t.id
                    ? "border-accent/40 bg-accent/10"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium text-foreground">
                    {t.title}
                  </span>
                  <Badge variant="outline">{t.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </button>
            ))}
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
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
                  className="block break-words text-xs text-accent hover:underline py-1"
                >
                  {d.title} ↗
                </a>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-8 space-y-4">
          {active ? <Card className="min-w-0 overflow-hidden border-border bg-card">
            <CardHeader className="flex-col items-start gap-3 space-y-0 border-b border-border xl:flex-row xl:flex-wrap xl:justify-between">
              <div className="min-w-0 flex-1">
                <CardTitle className="break-words text-base text-foreground">{active.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {active.description}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 xl:w-auto">
                <Button size="sm" variant="outline" className="h-auto min-h-10 whitespace-normal border-border bg-muted py-2 text-foreground" aria-describedby="studio-sample-description" onClick={() => void runSnippetLive()} disabled={running}>
                  {running ? "Running sample…" : hasLiveSample ? "Run live sample action" : "Check sample support"}
                </Button>
                <Button size="sm" variant="secondary" className="h-auto min-h-10 border-border bg-muted py-2 text-foreground" onClick={copyCode}>
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
              <p id="studio-sample-description" className="border-b border-border p-4 text-xs text-muted-foreground">{sampleDescription} {hasLiveSample && "This runs a fixed sample action, not the displayed code. It may request wallet approval and incur testnet fees."}</p>
              <pre tabIndex={0} aria-label={`${active.title} source code`} className="overflow-x-auto p-5 text-[12.5px] leading-relaxed font-mono text-foreground bg-muted max-h-[480px] scrollbar-thin">
                <code>{active.code}</code>
              </pre>
              {runLog.length > 0 && (
                <div role="log" aria-label="Sample action output" className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] border-t border-border p-3 font-mono text-[11px] space-y-1 bg-muted">
                  <p className="font-semibold text-foreground">Sample action output (not execution of displayed code)</p>
                  {runLog.filter(Boolean).map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith("✓")
                          ? "text-accent"
                          : line.startsWith("✗")
                            ? "text-danger"
                            : "text-muted-foreground"
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card> : <Card className="border-border bg-card"><CardContent className="p-5"><h2 className="font-semibold text-foreground">No template selected</h2><p className="mt-2 text-sm text-muted-foreground">No templates match the current search. Clear the search to browse all templates.</p><Button variant="outline" size="sm" className="mt-4 border-border bg-muted text-foreground" onClick={() => setQuery("")}>Clear search</Button></CardContent></Card>}

          <Card className="min-w-0 border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <Rocket aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                Contract deployment simulation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Local simulation of a Foundry/Viem-style deploy to Arc Testnet
                (chain 5042002, USDC gas). No transaction is broadcast and no
                contract is deployed or verified. Fees and addresses are illustrative.
              </p>
              <Button size="sm" variant="outline" className="h-auto min-h-10 whitespace-normal border-border bg-muted py-2 text-foreground" onClick={simulateDeploy}>
                Simulate ERC-20 deploy (local)
              </Button>
              {deployLog.length > 0 && (
                <div role="log" aria-label="Simulated deployment output, not on-chain" className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl border border-border bg-muted p-3 font-mono text-[12px] space-y-1">
                  <p className="font-semibold text-foreground">SIMULATED OUTPUT: placeholder address, fee and verification; not on-chain.</p>
                  {deployLog.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={
                        line.startsWith("✓")
                          ? "text-accent"
                          : "text-muted-foreground"
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
