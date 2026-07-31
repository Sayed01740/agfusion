/**
 * AGFusion final policy: LIVE ONLY.
 * Public config is intentionally minimal — no internal infra details.
 */

import { llmPublicStatus } from "@/lib/llm-config";

export type AppExecutionMode = "demo" | "live";

export function getConfiguredExecutionMode(): AppExecutionMode {
  return "live";
}

export function isDemoAllowed(): boolean {
  return false;
}

export function isLiveOnlySuccess(): boolean {
  return true;
}

export function agentRateLimitConfig() {
  return {
    windowMs: Number(process.env.AGENT_RATE_WINDOW_MS || 60_000),
    maxRequests: Number(process.env.AGENT_RATE_MAX || 40),
    maxExecute: Number(process.env.AGENT_RATE_EXECUTE_MAX || 15),
  };
}

export function maxTransferAmount(): number {
  return Number(process.env.MAX_TRANSFER_AMOUNT || 10_000);
}

/**
 * Safe for browsers / unauthenticated clients.
 * Never expose the full Circle kit key here (was scrapeable on /api/config).
 * Browser uses NEXT_PUBLIC_KIT_KEY or user paste in Stablecoin FX.
 */
export function getAppConfigPublic() {
  const raw = (
    process.env.NEXT_PUBLIC_KIT_KEY ||
    process.env.KIT_KEY ||
    ""
  ).trim();

  const kitKeyConfigured = Boolean(raw);
  // Last 4 of secret segment only — enough to confirm "saved", not reusable
  let kitKeyHint: string | null = null;
  if (raw) {
    const parts = raw.replace(/^KIT_KEY:/i, "").split(":");
    const secret = parts[parts.length - 1] || raw;
    kitKeyHint = secret.length >= 4 ? `…${secret.slice(-4)}` : "set";
  }

  return {
    product: "AGFusion",
    network: "Arc Testnet",
    chainId: 5042002,
    liveOnly: true,
    kitKeyConfigured,
    kitKeyHint,
    /** @deprecated never return full key — use NEXT_PUBLIC_KIT_KEY or paste */
    kitKey: null as string | null,
    ...(() => {
      const s = llmPublicStatus();
      return {
        llmConfigured: s.configured,
        llmProvider: s.provider,
        llmModel: s.model,
        llmProvidersAvailable: s.providersAvailable,
        anthropicKeyShapeOk: s.anthropicKeyShapeOk,
        llmBaseHost: s.baseUrlHost,
        /** Length of server LLM key (not the key itself) */
        llmKeyLen: s.llmKeyLen,
        /** First 4 chars only — e.g. "sk-a" — to confirm paste shape */
        llmKeyPrefix: s.llmKeyPrefix,
      };
    })(),
  };
}

/** Server-only config — never return this from public APIs */
export function getAppConfigInternal() {
  return {
    executionMode: "live" as const,
    allowDemo: false,
    chainId: 5042002,
    maxTransferAmount: maxTransferAmount(),
    version: "1.0.0-final",
  };
}
