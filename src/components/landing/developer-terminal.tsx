"use client";

import { useState } from "react";
import { Check, Copy, Terminal, Code2, Cpu, ExternalLink } from "lucide-react";
import Link from "next/link";

const SNIPPETS = {
  sdk: {
    language: "typescript",
    filename: "agent-runner.ts",
    code: `import { createAGFusionClient } from "@agfusion/sdk";
import { arcTestnet } from "@agfusion/chains";

// 1. Initialize non-custodial autonomous operator
const client = await createAGFusionClient({
  network: arcTestnet,
  accountMode: "erc4337", // ZeroDev / Circle Programmable Wallet
});

// 2. Formulate and simulate high-level intent
const plan = await client.formulateIntent({
  prompt: "Bridge 50 USDC to Base with lowest gas & swap to ETH",
  slippageToleranceBps: 25, // 0.25% max slippage
});

console.log("Estimated Gas:", plan.telemetry.estimatedGasUsd);
console.log("Route Steps:", plan.route.summary);

// 3. User approves plan via client-side signature
const txResult = await plan.executeWithSignature();
console.log("On-chain settlement hash:", txResult.hash);`
  },
  rpc: {
    language: "bash",
    filename: "curl-intent.sh",
    code: `# Dispatch intent via Headless AGFusion JSON-RPC
curl -X POST https://api.agfusion.io/v1/intent/plan \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer agf_live_99d08e1a" \\
  -d '{
    "sender": "0x71C...438E",
    "prompt": "Distribute 1000 USDC payroll across contributor list",
    "targetSubstrate": "arc-testnet",
    "safetyChecks": ["formal_verification", "slippage_guard"]
  }'`
  },
  solidity: {
    language: "solidity",
    filename: "IAGFusionReceiver.sol",
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAGFusionIntentReceiver {
    event IntentSettled(bytes32 indexed intentHash, address indexed user, uint256 volume);

    /// @notice Callback triggered when an AI agent executes on-chain settlement
    function onIntentFulfilled(
        bytes32 intentHash,
        address token,
        uint256 amount,
        bytes calldata executionProof
    ) external returns (bool success);
}`
  }
};

export function DeveloperTerminal() {
  const [activeTab, setActiveTab] = useState<keyof typeof SNIPPETS>("sdk");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SNIPPETS[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#070a0e]/90 shadow-2xl backdrop-blur-2xl overflow-hidden glow-border">
      {/* Terminal Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-muted/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/80"></span>
            <span className="h-3 w-3 rounded-full bg-amber-500/80"></span>
            <span className="h-3 w-3 rounded-full bg-emerald-500/80"></span>
          </div>
          <div className="ml-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <Terminal className="h-3.5 w-3.5 text-accent" />
            <span>{SNIPPETS[activeTab].filename}</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 bg-background/60 p-1 rounded-lg border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("sdk")}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "sdk" 
                ? "bg-accent/20 text-accent border border-accent/30 shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            TypeScript SDK
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rpc")}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "rpc" 
                ? "bg-accent/20 text-accent border border-accent/30 shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Intent API
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("solidity")}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "solidity" 
                ? "bg-accent/20 text-accent border border-accent/30 shadow-xs" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Solidity Hook
          </button>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code snippet"
          className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/40 transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" />
              <span className="text-accent">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="p-5 sm:p-6 overflow-x-auto text-xs font-mono leading-relaxed text-slate-200">
        <pre className="selection:bg-accent/30">
          <code>{SNIPPETS[activeTab].code}</code>
        </pre>
      </div>

      {/* Terminal Footer Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3 text-accent" />
            Arc Testnet VM Compatible
          </span>
          <span className="hidden sm:inline text-border">•</span>
          <span className="hidden sm:inline">TypeScript 5.0+ / Viem v2</span>
        </div>
        <Link 
          href="/dashboard" 
          className="inline-flex items-center gap-1 text-accent hover:underline font-medium"
        >
          Explore interactive sandbox <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
