import { createHash } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";

const ARC_MAINNET_CHAIN_ID = 5042;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type ArcQuoteSessionStoreResult =
  | { ok: true }
  | { ok: false; reason: "database_unavailable" | "invalid_session" };

export type ArcQuoteSessionConsumeResult =
  | { ok: true }
  | { ok: false; reason: "database_unavailable" | "invalid_or_consumed_session" };

/**
 * Persist only a one-way token digest. The encrypted quote payload remains
 * client-opaque and is never copied into the database.
 */
export async function registerArcQuoteSession(input: {
  token: string;
  account: string;
  chainId: number;
  expiresAt: number;
}): Promise<ArcQuoteSessionStoreResult> {
  if (
    !isDbConfigured() ||
    typeof input.token !== "string" ||
    input.token.length < 40 ||
    !/^0x[0-9a-f]{40}$/i.test(input.account) ||
    input.chainId !== ARC_MAINNET_CHAIN_ID ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return { ok: false, reason: isDbConfigured() ? "invalid_session" : "database_unavailable" };
  }

  try {
    await getPrisma().arcQuoteSession.create({
      data: {
        tokenHash: hashSessionToken(input.token),
        account: input.account.toLowerCase(),
        chainId: ARC_MAINNET_CHAIN_ID,
        expiresAt: new Date(input.expiresAt * 1000),
      },
      select: { id: true },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

/**
 * Atomic compare-and-set: exactly one concurrent request can transition an
 * unexpired, unconsumed quote from available to consumed. Never use a
 * read-then-write check here; PostgreSQL updateMany is the replay boundary.
 */
export async function consumeArcQuoteSession(input: {
  token: string;
  account: string;
  chainId: number;
  now?: Date;
}): Promise<ArcQuoteSessionConsumeResult> {
  if (!isDbConfigured()) return { ok: false, reason: "database_unavailable" };
  if (
    typeof input.token !== "string" ||
    input.token.length < 40 ||
    !/^0x[0-9a-f]{40}$/i.test(input.account) ||
    input.chainId !== ARC_MAINNET_CHAIN_ID
  ) {
    return { ok: false, reason: "invalid_or_consumed_session" };
  }

  const now = input.now ?? new Date();
  try {
    const result = await getPrisma().arcQuoteSession.updateMany({
      where: {
        tokenHash: hashSessionToken(input.token),
        account: input.account.toLowerCase(),
        chainId: ARC_MAINNET_CHAIN_ID,
        expiresAt: { gt: now },
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    return result.count === 1
      ? { ok: true }
      : { ok: false, reason: "invalid_or_consumed_session" };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}
