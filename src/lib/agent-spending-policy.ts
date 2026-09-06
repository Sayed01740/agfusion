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
  reservationId?: string;
};

const RESERVATION_TTL_MS = 15 * 60 * 1000;

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
    throw new Error("Invalid agent spending policy: per-tx <= daily <= weekly <= monthly is required.");
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

async function sumAgentSpend(
  db: Awaited<ReturnType<typeof getPrisma>>,
  walletAddress: string,
  since: Date,
): Promise<number> {
  const rows = await db.transaction.findMany({
    where: {
      walletAddress: walletAddress.toLowerCase(),
      executionMode: "live",
      status: { in: ["success", "pending", "retryable"] },
      createdAt: { gte: since },
      token: "USDC",
    },
    select: { amount: true },
  });

  return rows.reduce((total, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
}

async function sumActiveReservations(
  db: Awaited<ReturnType<typeof getPrisma>>,
  walletAddress: string,
  since: Date,
  operationId: string,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ amount: string }>>`
    SELECT "amount"
    FROM "AgentSpendReservation"
    WHERE "walletAddress" = ${walletAddress.toLowerCase()}
      AND "expiresAt" > ${new Date()}
      AND "createdAt" >= ${since}
      AND "operationId" <> ${operationId}
  `;

  return rows.reduce((total, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
}

export async function releaseAgentSpendReservation(operationId: string): Promise<void> {
  if (!operationId) return;
  try {
    const prisma = getPrisma();
    await prisma.$executeRaw`
      DELETE FROM "AgentSpendReservation"
      WHERE "operationId" = ${operationId}
    `;
  } catch (error) {
    console.warn("[AGFusion][AgentPolicy] reservation release failed", { error, operationId });
  }
}

export async function enforceAgentSpendingPolicy(params: {
  walletAddress: string;
  amount: string;
  action: AgentSpendAction;
  recipient?: string;
  isAgent: boolean;
  operationId?: string;
  now?: Date;
}): Promise<AgentPolicyDecision> {
  const policy = getAgentSpendingPolicy();
  const amount = Number(params.amount);
  const emptySpent = { daily: 0, weekly: 0, monthly: 0 };

  if (!params.isAgent) {
    return { allowed: true, reason: "Not an agent wallet; agent policy gate not applicable.", policy, spent: emptySpent };
  }
  if (!params.walletAddress) {
    return { allowed: false, reason: "Agent wallet address is required.", policy, spent: emptySpent };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: "Transaction amount must be a positive USDC value.", policy, spent: emptySpent };
  }
  if (amount > policy.perTx) {
    return {
      allowed: false,
      reason: `Agent policy blocked ${params.action}: ${amount} USDC exceeds the per-transaction cap of ${policy.perTx} USDC.`,
      policy,
      spent: emptySpent,
    };
  }
  if (!params.operationId) {
    return {
      allowed: false,
      reason: "Agent policy operation identity is required for atomic spending protection.",
      policy,
      spent: emptySpent,
    };
  }

  const now = params.now ?? new Date();
  const walletAddress = params.walletAddress.toLowerCase();
  const operationId = params.operationId;

  try {
    const prisma = getPrisma();
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS "AgentSpendReservation" (
          "id" TEXT PRIMARY KEY,
          "operationId" TEXT NOT NULL UNIQUE,
          "walletAddress" TEXT NOT NULL,
          "amount" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP(3) NOT NULL
        )
      `;

      // Serialize budget checks per wallet. The reservation is inserted in the
      // same transaction, so concurrent requests cannot both observe the same
      // remaining budget and then pass independently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${walletAddress}))`;

      await tx.$executeRaw`
        DELETE FROM "AgentSpendReservation"
        WHERE "expiresAt" <= ${now}
      `;

      const existing = await tx.$queryRaw<Array<{ amount: string; expiresAt: Date }>>`
        SELECT "amount", "expiresAt"
        FROM "AgentSpendReservation"
        WHERE "operationId" = ${operationId}
        LIMIT 1
      `;
      if (existing.length > 0 && existing[0].expiresAt > now) {
        const [daily, weekly, monthly] = await Promise.all([
          sumAgentSpend(tx, walletAddress, startOfUtcDay(now)),
          sumAgentSpend(tx, walletAddress, startOfUtcWeek(now)),
          sumAgentSpend(tx, walletAddress, startOfUtcMonth(now)),
        ]);
        const reservedDaily = await sumActiveReservations(tx, walletAddress, startOfUtcDay(now), operationId);
        const reservedWeekly = await sumActiveReservations(tx, walletAddress, startOfUtcWeek(now), operationId);
        const reservedMonthly = await sumActiveReservations(tx, walletAddress, startOfUtcMonth(now), operationId);
        return {
          allowed: true,
          reason: "Agent spending policy already reserved this operation.",
          policy,
          spent: {
            daily: daily + reservedDaily + Number(existing[0].amount),
            weekly: weekly + reservedWeekly + Number(existing[0].amount),
            monthly: monthly + reservedMonthly + Number(existing[0].amount),
          },
          reservationId: operationId,
        };
      }

      const [daily, weekly, monthly] = await Promise.all([
        sumAgentSpend(tx, walletAddress, startOfUtcDay(now)),
        sumAgentSpend(tx, walletAddress, startOfUtcWeek(now)),
        sumAgentSpend(tx, walletAddress, startOfUtcMonth(now)),
      ]);
      const reservedDaily = await sumActiveReservations(tx, walletAddress, startOfUtcDay(now), operationId);
      const reservedWeekly = await sumActiveReservations(tx, walletAddress, startOfUtcWeek(now), operationId);
      const reservedMonthly = await sumActiveReservations(tx, walletAddress, startOfUtcMonth(now), operationId);
      const spent = {
        daily: daily + reservedDaily,
        weekly: weekly + reservedWeekly,
        monthly: monthly + reservedMonthly,
      };

      if (spent.daily + amount > policy.daily) {
        return { allowed: false, reason: `Agent policy blocked ${params.action}: daily cap ${policy.daily} USDC would be exceeded.`, policy, spent };
      }
      if (spent.weekly + amount > policy.weekly) {
        return { allowed: false, reason: `Agent policy blocked ${params.action}: weekly cap ${policy.weekly} USDC would be exceeded.`, policy, spent };
      }
      if (spent.monthly + amount > policy.monthly) {
        return { allowed: false, reason: `Agent policy blocked ${params.action}: monthly cap ${policy.monthly} USDC would be exceeded.`, policy, spent };
      }

      const reservationId = `agent-${operationId}`;
      await tx.$executeRaw`
        INSERT INTO "AgentSpendReservation" ("id", "operationId", "walletAddress", "amount", "createdAt", "expiresAt")
        VALUES (${reservationId}, ${operationId}, ${walletAddress}, ${String(amount)}, ${now}, ${new Date(now.getTime() + RESERVATION_TTL_MS)})
      `;

      return {
        allowed: true,
        reason: "Agent spending policy approved and budget reserved atomically.",
        policy,
        spent: { daily: spent.daily + amount, weekly: spent.weekly + amount, monthly: spent.monthly + amount },
        reservationId,
      };
    });
  } catch (error) {
    console.error("[AGFusion][AgentPolicy] persistent storage check failed", {
      error,
      walletAddress,
      action: params.action,
      dbConfigured: Boolean(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL),
    });
    if (policy.failClosedWithoutDb) {
      return {
        allowed: false,
        reason: "Agent policy storage is unavailable; refusing to broadcast an autonomous payment.",
        policy,
        spent: emptySpent,
      };
    }
    return {
      allowed: true,
      reason: "Agent policy approved without persistent budget accounting because fail-closed mode is disabled.",
      policy,
      spent: emptySpent,
    };
  }
}
