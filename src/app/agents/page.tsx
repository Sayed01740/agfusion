"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Check,
  ExternalLink,
  Loader2,
  Shield,
  Wallet,
  Briefcase,
  Fingerprint,
} from "lucide-react";
import { DEMO_AGENTS } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { usePilotStore } from "@/store/pilot-store";
import { executeSend } from "@/lib/client-actions";
import type { AgentJob, AgentProfile } from "@/types";
import { uid } from "@/lib/utils";
import {
  advanceJob,
  AGENT_ECONOMY_DOCS,
  createJob,
  runJobEscrowLifecycle,
} from "@/lib/agent-economy";
import { quoteSendFee } from "@/lib/fees";
import {
  erc8004GlobalId,
  ERC8004_IDENTITY_REGISTRY,
  registerErc8004Agent,
} from "@/lib/erc8004";
import { AGFUSION_METADATA_URI } from "@/lib/onchain";

export default function AgentsPage() {
  const { addTransaction, setActiveTx, walletAddress } = usePilotStore();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [jobLog, setJobLog] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState(DEMO_AGENTS);
  const [activeJobs, setActiveJobs] = useState<AgentJob[]>([]);
  const [registryNote, setRegistryNote] = useState<string | null>(null);
  const [payoutTo, setPayoutTo] = useState("");
  const [registering, setRegistering] = useState(false);

  function viewPolicy(agent: AgentProfile) {
    setPolicyId((id) => (id === agent.id ? null : agent.id));
  }

  /**
   * Live ERC-8004: IdentityRegistry.register(metadataURI) on Arc Testnet.
   * Uses AGFusion public metadata; works for any agent card as the project agent.
   */
  async function register8004(agent: AgentProfile) {
    if (registering) return;
    if (!walletAddress) {
      setRegistryNote("Connect wallet on Arc Testnet first, then register ERC-8004.");
      return;
    }
    setRegistering(true);
    setRegistryNote(`Signing ERC-8004 register for ${agent.name}… confirm in Rabby.`);
    try {
      const result = await registerErc8004Agent({
        metadataURI: AGFUSION_METADATA_URI,
      });
      const idLabel = result.agentId
        ? erc8004GlobalId(result.agentId)
        : `tx:${result.txHash.slice(0, 12)}…`;
      setRegistryNote(
        `✓ ERC-8004 live · agentId=${result.agentId ?? "see tx"} · ${result.explorerUrl}`,
      );
      setAgents((list) =>
        list.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                erc8004Id: idLabel,
                reputation: Math.min(99, a.reputation + 2),
                status: "active" as const,
              }
            : a,
        ),
      );
      const txId = `tx_8004_${Date.now()}`;
      addTransaction({
        id: txId,
        type: "deploy",
        status: "success",
        amount: "0",
        token: "USDC",
        toChain: "Arc_Testnet",
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        message: `ERC-8004 register · ${agent.name} · registry ${ERC8004_IDENTITY_REGISTRY.slice(0, 10)}…`,
        executionMode: "live",
        steps: [
          {
            name: "IdentityRegistry.register",
            state: "success",
            txHash: result.txHash,
          },
        ],
        createdAt: new Date().toISOString(),
      });
      setActiveTx(txId);
    } catch (e) {
      setRegistryNote(
        `✗ ERC-8004 failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    } finally {
      setRegistering(false);
    }
  }

  async function runEscrowJob(agent: AgentProfile) {
    if (runningId) return;
    const payTo = (payoutTo || walletAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      setJobLog((l) => ({
        ...l,
        [agent.id]:
          "Paste a payout 0x address (or connect wallet) before running live settlement.",
      }));
      return;
    }
    setRunningId(agent.id);
    let job = createJob({
      agentId: agent.id,
      agentName: agent.name,
      budgetUsdc: "12.50",
      description: `${agent.role} · policy-bound payout`,
      recipient: payTo,
      recipientLabel: `${agent.name} payout`,
    });
    setActiveJobs((j) => [job, ...j].slice(0, 8));
    setJobLog((l) => ({
      ...l,
      [agent.id]: "ERC-8183 · simulate escrow phases (UI), then live 1 USDC payout…",
    }));

    try {
      job = await runJobEscrowLifecycle(job, {
        delayMs: 350,
        onPhase: (j) => {
          setActiveJobs((list) =>
            list.map((x) => (x.id === j.id ? j : x)),
          );
          setJobLog((l) => ({
            ...l,
            [agent.id]: `ERC-8183 · ${j.phase.replace("_", " ")}…`,
          }));
        },
      });

      setJobLog((l) => ({
        ...l,
        [agent.id]: "Settling live 1 USDC on Arc — confirm in Rabby…",
      }));
      const fee = quoteSendFee("1");
      const tx = await executeSend({
        amount: "1",
        token: "USDC",
        chain: "Arc_Testnet",
        recipient: payTo,
        recipientLabel: `${agent.name} escrow payout`,
        preferLive: true,
      });
      addTransaction({
        ...tx,
        feeUsd: fee.totalUsdc,
        message: `ERC-8183 completed · ${fee.headline}`,
      });
      setActiveTx(tx.id);
      job = advanceJob(job, "completed", `Tx ${tx.status}`);
      setActiveJobs((list) => list.map((x) => (x.id === job.id ? job : x)));
      setAgents((list) =>
        list.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                actions24h: a.actions24h + 1,
                status: "active" as const,
                reputation: Math.min(99, a.reputation + 0.5),
              }
            : a,
        ),
      );
      setJobLog((l) => ({
        ...l,
        [agent.id]: `✓ Escrow settled · 1 USDC · ${tx.status}${tx.txHash ? ` · ${tx.txHash.slice(0, 12)}…` : ""}`,
      }));
    } catch (e) {
      setJobLog((l) => ({
        ...l,
        [agent.id]: `✗ ${e instanceof Error ? e.message : "Job failed"}`,
      }));
    } finally {
      setRunningId(null);
    }
  }

  async function runSimpleJob(agent: AgentProfile) {
    if (runningId) return;
    const payTo = (payoutTo || walletAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      setJobLog((l) => ({
        ...l,
        [agent.id]:
          "Paste a payout 0x address (or connect wallet) before running live settlement.",
      }));
      return;
    }
    setRunningId(agent.id);
    setJobLog((l) => ({ ...l, [agent.id]: "Policy check…" }));
    try {
      const fee = quoteSendFee("1");
      const tx = await executeSend({
        amount: "1",
        token: "USDC",
        chain: "Arc_Testnet",
        recipient: payTo,
        recipientLabel: `${agent.name} payout`,
        preferLive: true,
      });
      addTransaction({ ...tx, feeUsd: fee.totalUsdc });
      setActiveTx(tx.id);
      setAgents((list) =>
        list.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                actions24h: a.actions24h + 1,
                status: "active" as const,
              }
            : a,
        ),
      );
      setJobLog((l) => ({
        ...l,
        [agent.id]: `✓ Live payout · 1 USDC · ${tx.status}${tx.txHash ? ` · ${tx.txHash.slice(0, 12)}…` : ""}`,
      }));
    } catch (e) {
      setJobLog((l) => ({
        ...l,
        [agent.id]: `✗ ${e instanceof Error ? e.message : "Job failed"}`,
      }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-cyan-400" />
          Agents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Arc agentic economy: ERC-8004 identity, ERC-8183 escrow jobs, policy
          limits, and USDC settlement with dollar-quoted gas.
        </p>
        <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/90 space-y-2">
          <p>
            <strong className="font-medium">ERC-8004:</strong>{" "}
            <span className="font-medium">Register on Arc</span> is a{" "}
            <strong className="font-medium">live</strong> call to IdentityRegistry
            ({ERC8004_IDENTITY_REGISTRY.slice(0, 10)}…) with metadata{" "}
            <code className="text-[10px]">agfusion-agent.json</code>. Escrow job
            phases are still UI-simulated; final payout is live 1 USDC.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={payoutTo}
              onChange={(e) => setPayoutTo(e.target.value)}
              placeholder={
                walletAddress
                  ? `Payout 0x (default: ${walletAddress.slice(0, 10)}…)`
                  : "Payout 0x address"
              }
              spellCheck={false}
              className="text-xs bg-slate-950/50"
            />
            <Button
              size="sm"
              type="button"
              disabled={registering || !walletAddress}
              onClick={() => void register8004(agents[0])}
              className="shrink-0"
            >
              {registering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Fingerprint className="h-3.5 w-3.5" />
              )}
              Register AGFusion (ERC-8004)
            </Button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          {
            icon: Fingerprint,
            title: "ERC-8004 identity",
            body: "Register agents with verifiable identity and reputation on Arc.",
          },
          {
            icon: Briefcase,
            title: "ERC-8183 jobs",
            body: "Create → fund escrow → deliver → settle USDC in sub-second finality.",
          },
          {
            icon: Wallet,
            title: "Policy-bound payments",
            body: "Max payout, Arc-only chain, human confirm above threshold.",
          },
        ].map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.title}>
              <CardContent className="p-5">
                <Icon className="h-5 w-5 text-cyan-400 mb-3" />
                <div className="font-medium">{f.title}</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {f.body}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {registryNote && (
        <p className="mb-4 text-xs text-emerald-400 font-mono">{registryNote}</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="h-full glow-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  <Badge
                    variant={agent.status === "active" ? "success" : "outline"}
                  >
                    {agent.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{agent.role}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Reputation
                    </div>
                    <div className="text-xl font-semibold text-cyan-300 tabular-nums">
                      {agent.reputation}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Actions 24h
                    </div>
                    <div className="text-xl font-semibold tabular-nums">
                      {agent.actions24h}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-500 space-y-0.5">
                  <div>{agent.identity}</div>
                  {agent.erc8004Id && (
                    <div className="text-cyan-400/80">{agent.erc8004Id}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.escrowEnabled && (
                    <Badge variant="outline">ERC-8183</Badge>
                  )}
                  {agent.batchEnabled && (
                    <Badge variant="outline">Batch</Badge>
                  )}
                  {agent.x402Enabled && <Badge variant="outline">x402</Badge>}
                </div>

                <FeeLineItems quote={quoteSendFee("12.50")} compact />

                <AnimatePresence>
                  {policyId === agent.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300 space-y-1.5 overflow-hidden"
                    >
                      <div className="font-medium text-cyan-300">
                        Policy · {agent.name}
                      </div>
                      <p>
                        • Max single payout: $
                        {agent.maxPayoutUsdc ?? 50} USDC
                      </p>
                      <p>• Allowed chain: Arc Testnet only</p>
                      <p>
                        • Payments:{" "}
                        {agent.paymentsEnabled ? "enabled" : "off"}
                      </p>
                      <p>• Requires human confirm above $25</p>
                      <p className="text-slate-500 font-mono text-[10px]">
                        policy_id={uid("pol")}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {jobLog[agent.id] && (
                  <p
                    className={`text-xs ${
                      jobLog[agent.id].startsWith("✓")
                        ? "text-emerald-400"
                        : jobLog[agent.id].startsWith("✗")
                          ? "text-red-400"
                          : "text-cyan-300/90"
                    }`}
                  >
                    {jobLog[agent.id]}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => viewPolicy(agent)}
                  >
                    {policyId === agent.id ? "Hide policy" : "Policy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={registering || !walletAddress}
                    onClick={() => void register8004(agent)}
                  >
                    {registering ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                    ERC-8004
                  </Button>
                  {agent.escrowEnabled ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      type="button"
                      disabled={runningId === agent.id || !agent.paymentsEnabled}
                      onClick={() => void runEscrowJob(agent)}
                    >
                      {runningId === agent.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Escrow…
                        </>
                      ) : jobLog[agent.id]?.startsWith("✓") ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Run again
                        </>
                      ) : (
                        "ERC-8183 job"
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      type="button"
                      disabled={runningId === agent.id || !agent.paymentsEnabled}
                      onClick={() => void runSimpleJob(agent)}
                    >
                      {runningId === agent.id ? "Running…" : "Run job"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {activeJobs.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ERC-8183 job timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs"
              >
                <div className="flex justify-between gap-2 mb-2">
                  <span className="font-medium text-slate-200">
                    {job.agentName} · {job.budgetUsdc} USDC
                  </span>
                  <Badge variant="cyan">{job.phase}</Badge>
                </div>
                <ol className="space-y-1 text-slate-500">
                  {job.timeline.map((t, i) => (
                    <li key={i} className="font-mono text-[10px]">
                      {t.phase} · {t.note}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Arc Build · agentic economy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {AGENT_ECONOMY_DOCS.map((d) => (
            <a
              key={d.url}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cyan-300/90 hover:text-cyan-200 rounded-lg border border-white/10 px-2.5 py-1.5"
            >
              {d.title}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
