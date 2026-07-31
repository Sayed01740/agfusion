/**
 * Arc agentic economy helpers — ERC-8004 identity, ERC-8183 jobs, x402 micropayments.
 * Shaped for Arc Testnet demos; wire real contracts via docs.arc.io tutorials.
 *
 * Docs:
 * - https://docs.arc.io/build/agentic-economy
 * - https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 * - https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job
 */

import { uid } from "@/lib/utils";
import { formatUsdc, quoteX402Fee } from "@/lib/fees";
import type {
  AgentJob,
  AgentProfile,
  AgentRegistration,
  JobPhase,
  X402Receipt,
} from "@/types";

/** ERC-8004-style registration payload (offchain-shaped for testnet UI) */
export function buildAgentRegistration(
  agent: Pick<AgentProfile, "name" | "role" | "identity">,
): AgentRegistration {
  return {
    standard: "ERC-8004",
    name: agent.name,
    role: agent.role,
    identity: agent.identity,
    chainId: 5042002,
    chain: "Arc_Testnet",
    registeredAt: new Date().toISOString(),
    metadataUri: `https://agfusion.vercel.app/agents/${agent.identity}`,
    capabilities: ["payments", "policy", "escrow"],
  };
}

/** ERC-8183 job lifecycle scaffold */
export function createJob(params: {
  agentId: string;
  agentName: string;
  budgetUsdc: string;
  description: string;
  recipient?: string;
  recipientLabel?: string;
}): AgentJob {
  const now = new Date().toISOString();
  return {
    id: uid("job"),
    standard: "ERC-8183",
    agentId: params.agentId,
    agentName: params.agentName,
    phase: "created",
    budgetUsdc: params.budgetUsdc,
    description: params.description,
    recipient: params.recipient,
    recipientLabel: params.recipientLabel,
    createdAt: now,
    updatedAt: now,
    timeline: [
      { phase: "created", at: now, note: "Job created on Arc Testnet" },
    ],
  };
}

export function advanceJob(
  job: AgentJob,
  phase: JobPhase,
  note?: string,
): AgentJob {
  const at = new Date().toISOString();
  return {
    ...job,
    phase,
    updatedAt: at,
    timeline: [
      ...job.timeline,
      { phase, at, note: note || phase.replace("_", " ") },
    ],
  };
}

/** Simulate full escrow happy path for demo / studio */
export async function runJobEscrowLifecycle(
  job: AgentJob,
  opts?: { onPhase?: (j: AgentJob) => void; delayMs?: number },
): Promise<AgentJob> {
  const delay = (ms: number) =>
    new Promise((r) => setTimeout(r, opts?.delayMs ?? ms));

  let j = advanceJob(job, "budget_set", `Budget ${job.budgetUsdc} USDC`);
  opts?.onPhase?.(j);
  await delay(280);

  j = advanceJob(j, "funded", "Escrow funded with USDC on Arc");
  opts?.onPhase?.(j);
  await delay(320);

  j = advanceJob(j, "submitted", "Deliverable submitted by agent");
  opts?.onPhase?.(j);
  await delay(300);

  j = advanceJob(j, "completed", "Settlement released · sub-second finality");
  opts?.onPhase?.(j);
  return j;
}

/**
 * x402 micropayment receipt (HTTP 402 pattern for agent-payable APIs).
 * Real facilitators settle USDC on Arc; this models the receipt for UI/tools.
 */
export function createX402Receipt(params: {
  tool: string;
  payer?: string;
  resource: string;
}): X402Receipt {
  const fee = quoteX402Fee(params.tool);
  return {
    protocol: "x402",
    status: "paid",
    tool: params.tool,
    resource: params.resource,
    amountUsdc: fee.totalUsdc,
    amountLabel: formatUsdc(fee.totalUsdc, 6),
    chainId: 5042002,
    chain: "Arc_Testnet",
    payer: params.payer,
    paidAt: new Date().toISOString(),
    receiptId: uid("x402"),
  };
}

/** Simple route risk score for oracle tool */
export function assessRouteRisk(params: {
  fromChain: string;
  toChain: string;
  amount: string;
}): {
  score: number;
  level: "low" | "medium" | "elevated";
  factors: string[];
  recommendation: string;
} {
  const amount = Number(params.amount) || 0;
  let score = 12;
  const factors: string[] = ["USDC rails on Arc", "Sub-second finality on destination"];

  if (params.fromChain !== params.toChain) {
    score += 18;
    factors.push("Cross-chain transfer step (attestation path)");
  }
  if (amount >= 500) {
    score += 15;
    factors.push("Larger notional — confirm recipient carefully");
  }
  if (params.toChain.includes("Arc")) {
    score -= 5;
    factors.push("Arc settlement: USDC gas, predictable fees");
  }

  score = Math.max(5, Math.min(95, score));
  const level = score < 30 ? "low" : score < 55 ? "medium" : "elevated";
  const recommendation =
    level === "low"
      ? "Route looks clean — confirm fee line item and execute."
      : level === "medium"
        ? "Standard multi-step route — use confirm dialog and track recovery."
        : "Elevated complexity — reduce size or settle on Arc first.";

  return { score, level, factors, recommendation };
}

export const AGENT_ECONOMY_DOCS = [
  {
    title: "Agentic economy overview",
    url: "https://docs.arc.io/build/agentic-economy",
  },
  {
    title: "Register AI agent (ERC-8004)",
    url: "https://docs.arc.io/arc/tutorials/register-your-first-ai-agent",
  },
  {
    title: "Create ERC-8183 job",
    url: "https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job",
  },
  {
    title: "Arc escrow sample",
    url: "https://github.com/circlefin/arc-escrow",
  },
  {
    title: "Circle OOAK",
    url: "https://github.com/circlefin/circle-ooak",
  },
  {
    title: "x402 agent payments (Circle)",
    url: "https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents",
  },
] as const;
