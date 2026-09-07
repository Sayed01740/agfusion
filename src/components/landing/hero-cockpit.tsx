"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Bot, 
  Check, 
  ShieldCheck, 
  Sparkles, 
  Terminal, 
  Activity, 
  Zap, 
  ArrowUpRight,
  SendHorizontal,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface IntentScenario {
  id: string;
  label: string;
  prompt: string;
  action: string;
  network: string;
  targetChain: string;
  amount: string;
  estGas: string;
  executionMode: string;
  hash: string;
  steps: string[];
}

const SCENARIOS: IntentScenario[] = [
  {
    id: "bridge",
    label: "Cross-Chain Bridge",
    prompt: "Bridge 25 USDC from Arc to Base via CCTP with minimal slippage",
    action: "Bridge & Settle",
    network: "Arc Testnet (Substrate)",
    targetChain: "Base Sepolia",
    amount: "25.00 USDC",
    estGas: "< $0.002 (0.00008 ETH)",
    executionMode: "ZeroDev Account Abstraction",
    hash: "0x8f2a...e41c",
    steps: [
      "Verify client signature (EIP-712)",
      "Initiate Circle CCTP burn on Arc",
      "Mint native USDC on Base Sepolia"
    ]
  },
  {
    id: "swap",
    label: "Optimal Swap",
    prompt: "Swap 100 USDC to ARC at best available market depth",
    action: "Algorithmic Swap",
    network: "Arc Testnet",
    targetChain: "Arc Native DEX",
    amount: "100.00 USDC → 100.00 ARC",
    estGas: "< $0.001",
    executionMode: "Circle Programmable Wallet",
    hash: "0x3c7d...99b2",
    steps: [
      "Aggregate mempool liquidity quotes",
      "Route execution through optimal pool",
      "Zero-slippage atomic settlement"
    ]
  },
  {
    id: "batch",
    label: "Treasury Payroll",
    prompt: "Disburse 50 USDC split equally among 2 audited dev wallets",
    action: "Batch Multi-Send",
    network: "Arc Testnet",
    targetChain: "Multi-Recipient (2)",
    amount: "50.00 USDC (25 each)",
    estGas: "< $0.003 (Batch discount)",
    executionMode: "Safe Multi-Sig / ERC-4337",
    hash: "0x6e1b...aa54",
    steps: [
      "Validate recipient compliance status",
      "Construct single multi-call transaction",
      "Simulate state change & sign"
    ]
  }
];

export function HeroCockpit() {
  const [activeScenario, setActiveScenario] = useState<IntentScenario>(SCENARIOS[0]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [blockHeight, setBlockHeight] = useState(489124);

  // Live block height increment simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setBlockHeight((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectScenario = (scenario: IntentScenario) => {
    setIsSimulating(true);
    setActiveScenario(scenario);
    setTimeout(() => setIsSimulating(false), 260);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    setIsSimulating(true);
    const mockHash = "0x" + Math.random().toString(16).substring(2, 6) + "..." + Math.random().toString(16).substring(2, 6);
    setActiveScenario({
      id: "custom",
      label: "Custom Intent",
      prompt: customInput,
      action: "Autonomous Execution",
      network: "Arc Testnet (Substrate)",
      targetChain: "Arc Native Ecosystem",
      amount: "Verified Intent Payload",
      estGas: "< $0.001 (Optimized)",
      executionMode: "Non-Custodial ERC-4337",
      hash: mockHash,
      steps: [
        "Natural language intent parsing",
        "Deterministic parameter extraction",
        "Mempool gas & route simulation",
        "Awaiting client approval"
      ]
    });
    setTimeout(() => setIsSimulating(false), 350);
  };

  return (
    <div className="card-pro p-5 shadow-2xl backdrop-blur-3xl sm:p-7 glow-border transition-all hover:border-accent/40" aria-label="Interactive AI Agent Intent Simulator">
      {/* Cockpit Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent shadow-sm shadow-accent/20">
            <Bot aria-hidden="true" className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight text-foreground font-display">AI Intent Cockpit</p>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/25">
                v2.4 Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Activity className="h-3 w-3 text-accent" />
              Sub-second route & intent verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-muted/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Arc Substrate: #{blockHeight.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Preset Intent Switcher Pills */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Simulate Real-World Intents:
          </p>
          <span className="text-[10px] font-mono text-accent">0.38s LATENCY</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => {
            const isSelected = activeScenario.id === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => handleSelectScenario(scenario)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-accent/20 text-accent border border-accent/40 shadow-sm shadow-accent/10 scale-[1.02]"
                    : "bg-muted/50 text-muted-foreground border border-white/10 hover:bg-muted hover:text-foreground active:scale-[0.98]"
                }`}
              >
                <Sparkles className={`h-3 w-3 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                {scenario.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Custom Intent Bar */}
      <form onSubmit={handleCustomSubmit} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Or type an intent: e.g. Swap 50 USDC to ARC..."
            className="w-full rounded-xl border border-white/10 bg-muted/50 px-3.5 py-2 pl-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Terminal className="absolute left-3 top-2.5 h-3.5 w-3.5 text-accent/70" />
        </div>
        <Button 
          type="submit" 
          size="sm" 
          disabled={!customInput.trim()}
          className="h-auto px-3.5 text-xs bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 cursor-pointer disabled:opacity-40"
        >
          <SendHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline ml-1">Simulate</span>
        </Button>
      </form>

      {/* Natural Language Prompt Display Bubble */}
      <div className="my-4 rounded-2xl border border-white/10 bg-muted/80 p-4 shadow-inner relative overflow-hidden">
        <div className="flex items-start gap-2.5">
          <Terminal className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <div className="w-full">
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1">
              <span>NATURAL_INTENT_STREAM</span>
              <span className="text-accent/90">EIP-712 VERIFIED</span>
            </div>
            <p className="text-sm font-medium text-foreground leading-relaxed">
              &ldquo;{activeScenario.prompt}&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Generated Deterministic Execution Plan */}
      <div className={`rounded-2xl border border-white/10 bg-background/90 p-5 shadow-lg backdrop-blur-md transition-opacity duration-200 ${isSimulating ? "opacity-35" : "opacity-100"}`}>
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent">
            <Check className="h-4 w-4" /> Deterministic Execution Plan
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            Hash: {activeScenario.hash}
          </span>
        </div>

        {/* Dynamic Amount / Value */}
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Payload Volume</span>
            <p className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl mt-0.5 text-gradient-pro">
              {activeScenario.amount}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Est. Network Fee</span>
            <p className="font-mono text-xs font-semibold text-emerald-400 mt-1">
              {activeScenario.estGas}
            </p>
          </div>
        </div>

        {/* Telemetry Parameter Table */}
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-card/60 p-3 text-xs">
          <div>
            <dt className="text-muted-foreground text-[11px]">Origin Substrate</dt>
            <dd className="font-medium text-foreground mt-0.5">{activeScenario.network}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[11px]">Settlement Target</dt>
            <dd className="font-medium text-accent mt-0.5">{activeScenario.targetChain}</dd>
          </div>
          <div className="col-span-2 pt-2 border-t border-border/40">
            <dt className="text-muted-foreground text-[11px]">Key Governance</dt>
            <dd className="font-medium text-foreground flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              {activeScenario.executionMode}
            </dd>
          </div>
        </dl>

        {/* Multi-step execution roadmap */}
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Automated Route Steps</p>
          {activeScenario.steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[10px] font-mono font-bold text-accent">
                {idx + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Call to action inside cockpit */}
        <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Client sign required
          </span>
          <Button asChild size="sm" className="shimmer-button bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer">
            <Link href="/dashboard" className="flex items-center gap-1.5">
              Test in Workspace <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Security Assurance Guarantee */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-accent" />
          Pre-execution slippage simulation & protection
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/80 hidden sm:inline">
          ZERO_KEY_STORAGE
        </span>
      </div>
    </div>
  );
}
