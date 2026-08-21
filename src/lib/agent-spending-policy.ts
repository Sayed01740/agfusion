import { getPrisma } from "@/lib/db";

export type AgentSpendAction = "bridge" | "swap" | "send" | "route" | "unified_spend" | "x402";

export type AgentSpendingPolicy = {
  perTx: number;
  daily: number;
  weekly: number;
  monthly: number;
  failClosedWithoutDb: boolean;
};

export type AgentPolicyDecision = {
  allowed: boolean;
  reason: string;
  policy: AgentSpendingPolicy;
  spent: { daily: number; weekly: number; monthly: number };
};

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getAgentSpendingPolicy(): AgentSpendingPolicy {
  const perTx = positiveEnv("AGENT_POLICY_PER_TX_USDC", 5);
  const daily = positiveEnv("AGENT_POLICY_DAILY_USDC", 25);
  const weekly = positiveEnv("AGENT_POLICY_WEEKLY_USDC", 100);
  const monthly = positiveEnv("AGENT_POLICY_MONTHLY_USDC", 500);

  if (!(perTx <= daily && daily <= weekly && weekly <= monthly)) {
    throw new Error(
      "Invalid agent spending policy: per-tx <= daily <= weekly <= monthly is required.",
    );
  }

  return {
    perTx,
    daily,
    weekly,
    monthly,
    failClosedWithoutDb: process.env.AGENT_POLICY_FAIL_CLOSED !== "false",
  };
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcWeek(now: Date): Date {
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() + mondayOffset);
  return startOfUtcDay(start);
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function sumAgentSpend(walletAddress: string, since: Date): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      walletAddress: walletAddress.toLowerCase(),
      executionMode: "live",
      status: { in: ["success", "pending", "retryable"] },
      createdAt: { gte: since },
      token: "USDC",
    },
  });

  const raw = result._sum.amount;
  return raw == null ? 0 : Number(raw);
}

/**
 * Independent pre-broadcast authorization for AI-controlled money movement.
 * Circle's Agent Wallet policies are useful platform guardrails, but Circle's
 * own terms also require applications to maintain independent controls and
 * monitoring. This gate therefore runs before the transaction service and is
 * deliberately fail-closed when production has no usable database.
 */
export async function enforceAgentSpendingPolicy(params: {
  walletAddress: string;
  amount: string;
  action: AgentSpendAction;
  recipient?: string;
  isAgent: boolean;
  now?: Date;
}): Promise<AgentPolicyDecision> {
  const policy = getAgentSpendingPolicy();
  const amount = Number(params.amount);
  if (!params.isAgent) {
    return {
      allowed: true,
      reason: "Not an agent wallet; agent policy gate not applicable.",
      policy,
      spent: { daily: 0, weekly: 0, monthly: 0 },
    };
  }
  if (!params.walletAddress) {
    return { allowed: false, reason: "Agent wallet address is required.", policy, spent: { daily: 0, weekly: 0, monthly: 0 } };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: "Transaction amount must be a positive USDC value.", policy, spent: { daily: 0, weekly: 0, monthly: 0 } };
  }
  if (amount > policy.perTx) {
    return { allowed: false, reason: `Agent policy blocked ${params.action}: ${amount} USDC exceeds the per-transaction cap of ${policy.perTx} USDC.`, policy, spent: { daily: 0, weekly: 0, monthly: 0 } };
  }

  const now = params.now ?? new Date();
  try {
    const [daily, weekly, monthly] = await Promise.all([
      sumAgentSpend(params.walletAddress, startOfUtcDay(now)),
      sumAgentSpend(params.walletAddress, startOfUtcWeek(now)),
      sumAgentSpend(params.walletAddress, startOfUtcMonth(now)),
    ]);
    const spent = { daily, weekly, monthly };
    if (daily + amount > policy.daily) {
      return { allowed: false, reason: `Agent policy blocked ${params.action}: daily cap ${policy.daily} USDC would be exceeded.`, policy, spent };
    }
    if (weekly + amount > policy.weekly) {
      return { allowed: false, reason: `Agent policy blocked ${params.action}: weekly cap ${policy.weekly} USDC would be exceeded.`, policy, spent };
    }
    if (monthly + amount > policy.monthly) {
      return { allowed: false, reason: `Agent policy blocked ${params.action}: monthly cap ${policy.monthly} USDC would be exceeded.`, policy, spent };
    }
    return { allowed: true, reason: "Agent spending policy approved.", policy, spent };
  } catch (error) {
    if (policy.failClosedWithoutDb) {
      return { allowed: false, reason: "Agent policy storage is unavailable; refusing to broadcast an autonomous payment.", policy, spent: { daily: 0, weekly: 0, monthly: 0 } };
    }
    console.warn("[AGFusion] agent spending policy storage unavailable", error);
    return { allowed: true, reason: "Agent policy approved without persistent budget accounting because fail-closed mode is disabled.", policy, spent: { daily: 0, weekly: 0, monthly: 0 } };
  }
}
