/**
 * AGFusion final policy: LIVE ONLY.
 * Public config is intentionally minimal — no internal infra details.
 *
 * Network identity comes from the canonical Arc chain module so Mainnet
 * config does not require changing the working Testnet code path.
 */
import { ARC_CHAIN_ID, ARC_NETWORK_NAME, IS_ARC_MAINNET } from "@/lib/arc-chain";
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
  // Keep Testnet's existing default. Mainnet has a conservative hard ceiling
  // until production limits are reviewed and explicitly changed in code.
  const fallback = IS_ARC_MAINNET ? 100 : 10_000;
  const raw = process.env.MAX_TRANSFER_AMOUNT?.trim();
  if (!raw) return fallback;

  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured <= 0) return fallback;
  return IS_ARC_MAINNET ? Math.min(configured, fallback) : configured;
}

/**
 * Safe for browsers / unauthenticated clients.
 * Never expose the full Circle kit key here.
 */
export function getAppConfigPublic() {
  const raw = (
    process.env.NEXT_PUBLIC_KIT_KEY ||
    process.env.KIT_KEY ||
    ""
  ).trim();

  const kitKeyConfigured = Boolean(raw);
  let kitKeyHint: string | null = null;
  if (raw) {
    const parts = raw.replace(/^KIT_KEY:/i, "").split(":");
    const secret = parts[parts.length - 1] || raw;
    kitKeyHint = secret.length >= 4 ? `…${secret.slice(-4)}` : "set";
  }

  return {
    product: "AGFusion",
    network: ARC_NETWORK_NAME,
    chainId: ARC_CHAIN_ID,
    liveOnly: true,
    kitKeyConfigured,
    kitKeyHint,
    /** @deprecated never return full key — use a provider-approved browser key or user paste */
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
        llmKeyLen: s.llmKeyLen,
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
    chainId: ARC_CHAIN_ID,
    maxTransferAmount: maxTransferAmount(),
    version: "1.0.0-final",
  };
}
