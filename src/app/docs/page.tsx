"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Code2,
  Terminal,
  Shield,
  Layers,
  Cpu,
  Fuel,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  KeyRound,
  FileSpreadsheet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "overview", title: "1. Overview & Architecture", icon: BookOpen },
  { id: "arc-network", title: "2. Arc Network & USDC Gas", icon: Fuel },
  { id: "core-engine", title: "3. Swap, Send & Bridge", icon: Layers },
  { id: "batch-payroll", title: "4. Batch Disperse & CSV", icon: FileSpreadsheet },
  { id: "escrow", title: "5. On-Chain Agent Escrow", icon: Shield },
  { id: "session-keys", title: "6. Autonomous Session Keys", icon: KeyRound },
  { id: "x402", title: "7. Machine-to-Machine (x402)", icon: Cpu },
  { id: "mcp-server", title: "8. AGFusion MCP Server", icon: Terminal },
  { id: "contracts", title: "9. Verified Contracts", icon: Code2 },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  function copyCode(code: string, id: string) {
    void navigator.clipboard.writeText(code);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-10 text-center sm:text-left border-b border-white/[0.08] pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> AGFusion Developer &amp; Reviewer Documentation
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          AGFusion Protocol Documentation
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
          Complete guide to AGFusion: the AI-native stablecoin operating system on Arc Network.
          Explore our smart contract architecture, native USDC gas economy, agent escrow lifecycles,
          and Model Context Protocol (MCP) integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1">
          <div className="sticky top-20 rounded-2xl border border-white/[0.08] bg-[#0c1219]/90 p-3.5 backdrop-blur-xl shadow-xl">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">
              Documentation Index
            </div>
            <nav className="space-y-1">
              {SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const active = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(sec.id);
                      document.getElementById(sec.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm"
                        : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{sec.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-white/[0.06] px-2 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Arc Testnet:</span>
                <span className="font-mono text-emerald-400">5042002</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Gas Token:</span>
                <span className="font-mono text-slate-200">USDC (18 dec)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Architecture:</span>
                <span className="font-mono text-cyan-400">Non-custodial</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Documentation Content Body */}
        <div className="space-y-12 lg:col-span-3 text-slate-200">
          {/* Section 1: Overview */}
          <section id="overview" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <BookOpen className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">1. Overview &amp; Architecture</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              <strong>AGFusion</strong> is an AI-assisted stablecoin workspace and agentic command layer built on <strong>Arc Network</strong>.
              It eliminates multi-dapp fragmentation by unifying payments, token swaps, cross-chain CCTP bridging, and corporate treasury management into a single, high-performance interface.
            </p>
            <div className="rounded-2xl border border-white/[0.06] bg-black/40 p-4 font-mono text-xs text-slate-300 space-y-2 mb-4">
              <div className="text-emerald-400 font-bold">// High-Level System Architecture</div>
              <div>Web UI (Next.js 15 / React 19 / Viem)</div>
              <div>&nbsp;&nbsp;│</div>
              <div>&nbsp;&nbsp;├── AI Intent / Function-Calling Loop (Natural Language &rarr; Structured Plan)</div>
              <div>&nbsp;&nbsp;├── Policy Engine &amp; ERC-7715 Autonomous Session Keys</div>
              <div>&nbsp;&nbsp;├── Blockchain Layer (Arc Testnet 5042002 · Native USDC Gas)</div>
              <div>&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── AGFusionDisperse.sol (Single-Signature Batch Payouts)</div>
              <div>&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── AGFusionEscrow.sol (Milestone-based Agent Escrow)</div>
              <div>&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;└── Circle CCTP v2 (Cross-Chain Settlement Arc &harr; Base Sepolia)</div>
              <div>&nbsp;&nbsp;└── Machine-to-Machine HTTP-402 Micropayment Infrastructure</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
              <strong>Core Money-Safety Rule:</strong> The AI layer prepares and validates actions. It never holds private keys. On-chain execution remains behind policy boundaries and cryptographic wallet authorization (or scoped session keys).
            </div>
          </section>

          {/* Section 2: Arc Network & USDC Gas */}
          <section id="arc-network" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Fuel className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">2. Arc Network &amp; Native USDC Gas</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              On traditional EVM networks (Ethereum, Arbitrum, Optimism), users must hold volatile native gas tokens (ETH).
              <strong>Arc Network revolutionizes this: native gas is paid directly in USDC (18 decimals).</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-xs">
              <div className="rounded-2xl border border-white/[0.06] bg-black/40 p-4">
                <div className="text-slate-400 mb-1">Arc Testnet Parameters</div>
                <div className="space-y-1 font-mono">
                  <div><strong>Chain ID:</strong> 5042002 (<span className="text-slate-400">0x4cef52</span>)</div>
                  <div><strong>RPC:</strong> https://rpc.testnet.arc.network</div>
                  <div><strong>Explorer:</strong> https://testnet.arcscan.app</div>
                  <div><strong>Gas Token:</strong> Native USDC (18 decimals)</div>
                  <div><strong>Faucet:</strong> https://faucet.circle.com</div>
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                <div className="text-emerald-400 font-bold mb-1">USDC Gas Cost Advantage</div>
                <p className="text-slate-300 mb-2 leading-relaxed">
                  A standard 21,000 gas transfer at 1.5 Gwei costs:
                </p>
                <div className="font-mono text-emerald-300 text-sm font-bold">
                  21,000 × 1.5e-9 = 0.0000315 USDC
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Compared to ~$2.80 on Ethereum L1, Arc provides over <strong>99.9% cost reduction</strong> with zero volatile asset exposure.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Core Engine */}
          <section id="core-engine" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
                <Layers className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">3. Swap, Send &amp; Cross-Chain CCTP Bridge</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              AGFusion provides 4 unified money actions directly from the home surface:
            </p>
            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 flex items-start gap-3">
                <span className="font-mono text-emerald-400 font-bold">Swap</span>
                <div>
                  <div className="text-white font-semibold">Decentralized Stablecoin Exchange</div>
                  <div className="text-slate-400">Live quotes via Arc Uniswap-V2 style DEX router between USDC, EURC, and wrapped assets.</div>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold">Send</span>
                <div>
                  <div className="text-white font-semibold">Canonical ERC-20 &amp; Native Transfer</div>
                  <div className="text-slate-400">Direct transfer with explicit gas calculation and verification on ArcScan.</div>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 flex items-start gap-3">
                <span className="font-mono text-indigo-400 font-bold">Bridge</span>
                <div>
                  <div className="text-white font-semibold">Circle CCTP Cross-Chain Burn &amp; Mint</div>
                  <div className="text-slate-400">Moves native USDC between Arc Testnet and Base Sepolia with server-side attestation tracking.</div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Batch Disperse & CSV */}
          <section id="batch-payroll" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">4. Single-Signature Batch Payouts &amp; CSV Import</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              Corporate payroll and contractor disbursements on traditional dApps require approving and signing for every recipient individually.
              AGFusion solves this via <strong>AGFusionDisperse.sol</strong>:
            </p>
            <div className="relative rounded-2xl bg-black/50 p-4 border border-white/[0.06] font-mono text-xs mb-4">
              <div className="text-slate-400 mb-2">// Solidity Interface: Single-Signature Disperse</div>
              <div className="text-emerald-300">
                function disperseToken(IERC20 token, address[] calldata recipients, uint256[] calldata values) external;
              </div>
            </div>
            <h4 className="text-sm font-semibold text-white mb-2">B2B CSV Import Format</h4>
            <p className="text-xs text-slate-300 mb-3">
              Upload a standard spreadsheet with columns <code className="text-emerald-400">address,amount,label</code> to instantly populate all payout rows:
            </p>
            <div className="rounded-xl bg-black/40 border border-white/[0.06] p-3 font-mono text-xs text-slate-300 mb-4">
              0x1111111111111111111111111111111111111111,10.5,Lead Engineer<br />
              0x2222222222222222222222222222222222222222,8.0,Product Designer<br />
              0x3333333333333333333333333333333333333333,5.2,Security Auditor
            </div>
            <p className="text-xs text-slate-400">
              Use the <strong>"Statement"</strong> button to export completed disbursements into GAAP-compliant CSV accounting records with ArcScan hashes.
            </p>
          </section>

          {/* Section 5: Escrow */}
          <section id="escrow" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Shield className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">5. On-Chain AI Agent Escrow (AGFusionEscrow.sol)</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              Rather than simulating agent escrow phases in the UI, AGFusion deploys a verified on-chain escrow contract on Arc:
            </p>
            <div className="space-y-2 text-xs mb-4">
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-between">
                <span>1. Client funds task:</span>
                <span className="font-mono text-emerald-400">createTask(agent, token, amount, deadline, taskUri)</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-between">
                <span>2. Agent submits proof:</span>
                <span className="font-mono text-cyan-400">submitProof(taskId, proofUri)</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-between">
                <span>3. Client releases payment:</span>
                <span className="font-mono text-emerald-400">releasePayment(taskId)</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-between">
                <span>4. Automated expiration refund:</span>
                <span className="font-mono text-amber-400">refundExpired(taskId)</span>
              </div>
            </div>
          </section>

          {/* Section 6: Session Keys */}
          <section id="session-keys" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                <KeyRound className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">6. ERC-7715 Autonomous Session Keys</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              To power truly autonomous AI workflows without constant wallet popups, AGFusion implements an <strong>ERC-7715 scoped session engine</strong>:
            </p>
            <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1.5 mb-4">
              <li><strong>Daily Spend Cap:</strong> Hard limit (e.g. 10.00 USDC per day) that resets at 00:00 UTC.</li>
              <li><strong>Per-Transaction Cap:</strong> Prevents rogue large transactions (e.g. max 2.00 USDC per call).</li>
              <li><strong>Target Whitelist:</strong> Only verified contracts (DEX Router, Escrow, Disperse) are authorized.</li>
              <li><strong>24-Hour Expiration:</strong> Automatically invalidates sessions requiring user renewal.</li>
            </ul>
          </section>

          {/* Section 7: x402 Micropayments */}
          <section id="x402" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
                <Cpu className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">7. Machine-to-Machine HTTP-402 (x402) Protocol</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              Arc Network is the ideal home for machine-to-machine commerce. AGFusion implements the <strong>HTTP-402 (Payment Required)</strong> specification for pay-per-call AI endpoints:
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-black/40 p-3 font-mono text-xs text-slate-300 mb-3">
              <span className="text-amber-400">GET /api/x402/agent-service</span> &rarr; HTTP 402 Payment Required<br />
              Headers: X-Payment-Token: USDC | X-Payment-Amount: 0.001 | X-Payment-ChainId: 5042002
            </div>
            <p className="text-xs text-slate-400">
              When an agent pays $0.001 USDC on Arc and provides the transaction hash in <code className="text-emerald-400">X-Payment-Tx</code>, the endpoint unlocks live algorithmic liquidity and routing telemetry.
            </p>
          </section>

          {/* Section 8: MCP Server */}
          <section id="mcp-server" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Terminal className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">8. AGFusion MCP (Model Context Protocol) Server</h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 mb-4">
              AGFusion provides an official MCP Server that connects Claude Desktop, Cursor, and IDE AI agents to Arc Network tools over standard stdio JSON-RPC:
            </p>
            <div className="relative rounded-2xl bg-black/50 p-4 border border-white/[0.06] font-mono text-xs mb-4">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span>claude_desktop_config.json</span>
                <button
                  type="button"
                  onClick={() =>
                    copyCode(
                      `{\n  "mcpServers": {\n    "agfusion-arc": {\n      "command": "node",\n      "args": ["<PATH_TO_PROJECT>/mcp/server.mjs"]\n    }\n  }\n}`,
                      "mcp-config"
                    )
                  }
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                >
                  {copiedText === "mcp-config" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedText === "mcp-config" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="text-slate-300 whitespace-pre">
{`{
  "mcpServers": {
    "agfusion-arc": {
      "command": "node",
      "args": ["C:/Users/sayed/.grok/bin/agfusion/mcp/server.mjs"]
    }
  }
}`}
              </pre>
            </div>
            <div className="text-xs text-slate-400">
              Exposed Tools: <code className="text-emerald-300">arc_get_network_info</code>, <code className="text-emerald-300">arc_get_balance</code>, <code className="text-emerald-300">arc_estimate_gas_savings</code>, <code className="text-emerald-300">arc_prepare_batch_disperse</code>, and <code className="text-emerald-300">arc_escrow_query</code>.
            </div>
          </section>

          {/* Section 9: Verified Contracts */}
          <section id="contracts" className="rounded-3xl border border-white/[0.08] bg-[#0b1017]/80 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Code2 className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl">9. Verified Contracts on ArcScan</h2>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">AGFusionRegistry</div>
                  <div className="font-mono text-[11px] text-slate-400">0x76bb5678ec11ae94b34ed9cf90b25c9eea440483</div>
                </div>
                <a
                  href="https://testnet.arcscan.app/address/0x76bb5678ec11ae94b34ed9cf90b25c9eea440483"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  ArcScan Explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">AGFusionDisperse (Batch Payouts)</div>
                  <div className="font-mono text-[11px] text-slate-400">contracts/src/AGFusionDisperse.sol</div>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                  Foundry Tested
                </Badge>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">AGFusionEscrow (Agent Milestones)</div>
                  <div className="font-mono text-[11px] text-slate-400">contracts/src/AGFusionEscrow.sol</div>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                  Foundry Tested
                </Badge>
              </div>
            </div>
          </section>

          {/* Quick Action Return */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-cyan-950/40">
            <div>
              <h3 className="font-bold text-white text-base">Ready to test AGFusion?</h3>
              <p className="text-xs text-slate-300">Launch the live unified swap, batch payroll, or agent workspace on Arc Testnet.</p>
            </div>
            <Link href="/">
              <Button size="lg" className="bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-bold">
                Open dApp Surface <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
