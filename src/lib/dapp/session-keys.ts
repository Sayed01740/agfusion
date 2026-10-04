/**
 * ERC-7715 inspired Session Keys & Policy-Bound Autonomous Agent Engine for Arc Network.
 * Allows users to delegate limited, safe transaction authority to AI Agents.
 */

export type SessionPolicy = {
  enabled: boolean;
  sessionKey: string; // Ephemeral public address
  maxDailySpendUsdc: number;
  maxPerTxUsdc: number;
  allowedTokens: string[]; // ['USDC', 'EURC']
  allowedContracts: string[]; // Whitelisted contracts on Arc
  validUntil: number; // Unix timestamp ms
  spentTodayUsdc: number;
  lastResetDay: string; // YYYY-MM-DD
  auditLog: Array<{
    id: string;
    timestamp: number;
    amountUsdc: number;
    recipientOrTarget: string;
    action: string;
    status: "authorized" | "rejected";
    reason?: string;
  }>;
};

const STORAGE_KEY = "agfusion_session_policy_v1";

const DEFAULT_POLICY: SessionPolicy = {
  enabled: false,
  sessionKey: "0x7715A9e200192804b34190cFa922b5123000Arc1",
  maxDailySpendUsdc: 10.0,
  maxPerTxUsdc: 2.0,
  allowedTokens: ["USDC", "EURC"],
  allowedContracts: [
    "0x76bb5678ec11ae94b34ed9cf90b25c9eea440483", // AGFusionRegistry
  ],
  validUntil: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  spentTodayUsdc: 0,
  lastResetDay: new Date().toISOString().slice(0, 10),
  auditLog: [],
};

export function getSessionPolicy(): SessionPolicy {
  if (typeof window === "undefined") return DEFAULT_POLICY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POLICY;
    const policy = JSON.parse(raw) as SessionPolicy;

    // Reset daily tally if new UTC day
    const today = new Date().toISOString().slice(0, 10);
    if (policy.lastResetDay !== today) {
      policy.spentTodayUsdc = 0;
      policy.lastResetDay = today;
      saveSessionPolicy(policy);
    }
    return policy;
  } catch {
    return DEFAULT_POLICY;
  }
}

export function saveSessionPolicy(policy: SessionPolicy): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  } catch (err) {
    console.error("Failed to save session policy:", err);
  }
}

export type PolicyCheckResult = {
  allowed: boolean;
  reason?: string;
  remainingDailyAllowance: number;
};

export function evaluateSessionPolicy(
  amountUsdc: number,
  targetAddress: string,
  tokenSymbol: string = "USDC"
): PolicyCheckResult {
  const policy = getSessionPolicy();
  const remaining = Math.max(0, policy.maxDailySpendUsdc - policy.spentTodayUsdc);

  if (!policy.enabled) {
    return {
      allowed: false,
      reason: "Autonomous session mode is not enabled.",
      remainingDailyAllowance: 0,
    };
  }

  if (Date.now() > policy.validUntil) {
    return {
      allowed: false,
      reason: "Session key has expired. Please renew the policy.",
      remainingDailyAllowance: 0,
    };
  }

  if (!policy.allowedTokens.includes(tokenSymbol.toUpperCase())) {
    return {
      allowed: false,
      reason: `Token ${tokenSymbol} is not whitelisted in session policy.`,
      remainingDailyAllowance: remaining,
    };
  }

  if (amountUsdc > policy.maxPerTxUsdc) {
    return {
      allowed: false,
      reason: `Amount ($${amountUsdc}) exceeds per-transaction limit ($${policy.maxPerTxUsdc} USDC).`,
      remainingDailyAllowance: remaining,
    };
  }

  if (policy.spentTodayUsdc + amountUsdc > policy.maxDailySpendUsdc) {
    return {
      allowed: false,
      reason: `Amount exceeds remaining daily allowance ($${remaining.toFixed(2)} USDC remaining).`,
      remainingDailyAllowance: remaining,
    };
  }

  return {
    allowed: true,
    remainingDailyAllowance: remaining - amountUsdc,
  };
}

export function recordSessionExecution(
  amountUsdc: number,
  targetAddress: string,
  action: string,
  allowed: boolean,
  reason?: string
): void {
  const policy = getSessionPolicy();
  if (allowed) {
    policy.spentTodayUsdc += amountUsdc;
  }

  policy.auditLog.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    amountUsdc,
    recipientOrTarget: targetAddress,
    action,
    status: allowed ? "authorized" : "rejected",
    reason,
  });

  // Keep last 50 logs
  policy.auditLog = policy.auditLog.slice(0, 50);
  saveSessionPolicy(policy);
}
