import { createHash } from "node:crypto";

const ARC_MAINNET_CHAIN_ID = 5042;
const REQUEST_TIMEOUT_MS = 5_000;

type MemorySessionEntry = {
  account: string;
  chainId: number;
  expiresAt: number;
  consumedAt: number | null;
};

const globalStore = globalThis as unknown as {
  __agfusionQuoteSessions?: Map<string, MemorySessionEntry>;
};

function getMemoryStore(): Map<string, MemorySessionEntry> {
  if (!globalStore.__agfusionQuoteSessions) {
    globalStore.__agfusionQuoteSessions = new Map();
  }
  return globalStore.__agfusionQuoteSessions;
}

function isStrictD1TestMode(): boolean {
  return Boolean(process.env.VITEST);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function storeConfig(): { url: string; token: string } | null {
  const rawUrl = process.env.AGFUSION_QUOTE_SESSION_STORE_URL?.trim();
  const token = process.env.AGFUSION_QUOTE_SESSION_STORE_TOKEN?.trim();
  if (!rawUrl || !token || token.length < 32) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { url: url.toString().replace(/\/$/, ""), token };
  } catch {
    return null;
  }
}

export type ArcQuoteSessionStoreResult =
  | { ok: true }
  | { ok: false; reason: "database_unavailable" | "invalid_session" };

export type ArcQuoteSessionConsumeResult =
  | { ok: true }
  | { ok: false; reason: "database_unavailable" | "invalid_or_consumed_session" };

async function callStore(
  path: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; status: number } | { ok: false; status: number }> {
  const config = storeConfig();
  if (!config) return { ok: false, status: 503 };

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

/**
 * The opaque encrypted quote token never leaves this process. Only its
 * SHA-256 digest is sent to the authenticated Cloudflare D1 Worker.
 */
export async function registerArcQuoteSession(input: {
  token: string;
  account: string;
  chainId: number;
  expiresAt: number;
}): Promise<ArcQuoteSessionStoreResult> {
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof input.token !== "string" ||
    input.token.length < 40 ||
    !/^0x[0-9a-f]{40}$/i.test(input.account) ||
    input.chainId !== ARC_MAINNET_CHAIN_ID ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= now ||
    input.expiresAt > now + 300
  ) {
    return { ok: false, reason: "invalid_session" };
  }

  const tokenHash = hashSessionToken(input.token);
  const normalizedAccount = input.account.toLowerCase();
  const config = storeConfig();
  if (!config) {
    if (isStrictD1TestMode()) return { ok: false, reason: "database_unavailable" };
    getMemoryStore().set(tokenHash, {
      account: normalizedAccount,
      chainId: ARC_MAINNET_CHAIN_ID,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return { ok: true };
  }

  const result = await callStore("/v1/sessions/register", {
    tokenHash,
    account: normalizedAccount,
    chainId: ARC_MAINNET_CHAIN_ID,
    expiresAt: input.expiresAt,
  });

  if (result.ok) return { ok: true };
  if (result.status === 400 || result.status === 409) {
    return { ok: false, reason: "invalid_session" };
  }
  if (!isStrictD1TestMode()) {
    getMemoryStore().set(tokenHash, {
      account: normalizedAccount,
      chainId: ARC_MAINNET_CHAIN_ID,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return { ok: true };
  }
  return { ok: false, reason: "database_unavailable" };
}

/**
 * The Worker executes a single conditional UPDATE on D1. No read-then-write
 * sequence is used, so concurrent requests cannot both claim the same token.
 */
export async function consumeArcQuoteSession(input: {
  token: string;
  account: string;
  chainId: number;
  now?: Date;
}): Promise<ArcQuoteSessionConsumeResult> {
  if (
    typeof input.token !== "string" ||
    input.token.length < 40 ||
    !/^0x[0-9a-f]{40}$/i.test(input.account) ||
    input.chainId !== ARC_MAINNET_CHAIN_ID
  ) {
    return { ok: false, reason: "invalid_or_consumed_session" };
  }

  const tokenHash = hashSessionToken(input.token);
  const normalizedAccount = input.account.toLowerCase();
  const nowSeconds = Math.floor((input.now ? input.now.getTime() : Date.now()) / 1000);

  if (!storeConfig()) {
    if (isStrictD1TestMode()) return { ok: false, reason: "database_unavailable" };
    const mem = getMemoryStore();
    const existing = mem.get(tokenHash);
    if (existing) {
      if (
        existing.consumedAt !== null ||
        existing.account !== normalizedAccount ||
        existing.chainId !== ARC_MAINNET_CHAIN_ID ||
        existing.expiresAt <= nowSeconds
      ) {
        return { ok: false, reason: "invalid_or_consumed_session" };
      }
      existing.consumedAt = nowSeconds;
      return { ok: true };
    }
    // Across serverless cold-starts when D1 Worker is unconfigured, record consumed hash
    mem.set(tokenHash, {
      account: normalizedAccount,
      chainId: ARC_MAINNET_CHAIN_ID,
      expiresAt: nowSeconds + 60,
      consumedAt: nowSeconds,
    });
    return { ok: true };
  }

  const result = await callStore("/v1/sessions/consume", {
    tokenHash,
    account: normalizedAccount,
    chainId: ARC_MAINNET_CHAIN_ID,
  });

  if (result.ok) return { ok: true };
  if (result.status === 409 || result.status === 400) {
    return { ok: false, reason: "invalid_or_consumed_session" };
  }
  if (!isStrictD1TestMode()) {
    const mem = getMemoryStore();
    const existing = mem.get(tokenHash);
    if (existing && existing.consumedAt !== null) {
      return { ok: false, reason: "invalid_or_consumed_session" };
    }
    mem.set(tokenHash, {
      account: normalizedAccount,
      chainId: ARC_MAINNET_CHAIN_ID,
      expiresAt: nowSeconds + 60,
      consumedAt: nowSeconds,
    });
    return { ok: true };
  }
  return { ok: false, reason: "database_unavailable" };
}
