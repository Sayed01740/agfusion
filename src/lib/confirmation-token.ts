import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";

const TOKEN_VERSION = "v1";
const TTL_SECONDS = 10 * 60;
// Development-only fallback. Production consumes confirmation capabilities in
// PostgreSQL so serverless instances cannot independently accept the same token.
const consumedTokens = new Map<string, number>();

type ConfirmationPayload = {
  v: typeof TOKEN_VERSION;
  exp: number;
  wallet: string;
  fingerprint: string;
};

/**
 * Confirmation tokens must use a stable server-only secret in production.
 * Prefer AUTH_SECRET/SIWE_SECRET, but keep the transaction confirmation gate
 * functional on deployments that already have Circle configured and do not
 * have a separate auth secret yet. CIRCLE_API_KEY never reaches the client.
 */
function secret(): string {
  const value =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SIWE_SECRET?.trim() ||
    process.env.CIRCLE_API_KEY?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") {
    return "agfusion-local-dev-confirm-secret-change-me";
  }
  throw new Error("A server confirmation secret is required.");
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function normalizeWallet(wallet?: string | null): string {
  return String(wallet || "").trim().toLowerCase();
}

export function confirmationFingerprint(input: Record<string, unknown>): string {
  const canonical = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((out, key) => {
      const value = input[key];
      if (value !== undefined) out[key] = value;
      return out;
    }, {});
  return createHmac("sha256", secret())
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function issueConfirmationToken(input: {
  wallet?: string | null;
  action: Record<string, unknown>;
}): string {
  const payload: ConfirmationPayload = {
    v: TOKEN_VERSION,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    wallet: normalizeWallet(input.wallet),
    fingerprint: confirmationFingerprint(input.action),
  };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyConfirmationToken(input: {
  token?: string | null;
  wallet?: string | null;
  action: Record<string, unknown>;
}): boolean {
  const token = String(input.token || "");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  try {
    const expected = sign(encoded);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConfirmationPayload;
    if (!payload || payload.v !== TOKEN_VERSION) return false;
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return false;
    if (payload.wallet !== normalizeWallet(input.wallet)) return false;
    return payload.fingerprint === confirmationFingerprint(input.action);
  } catch {
    return false;
  }
}

/**
 * Verify and atomically consume a one-time capability. Production requires the
 * shared database to prevent replay across separate serverless instances.
 */
export async function consumeConfirmationToken(input: {
  token?: string | null;
  wallet?: string | null;
  action: Record<string, unknown>;
}): Promise<boolean> {
  const token = String(input.token || "");
  if (!verifyConfirmationToken(input)) return false;

  if (isDbConfigured()) {
    try {
      const prisma = getPrisma();
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ConsumedConfirmationToken" (
          "tokenHash" TEXT PRIMARY KEY,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await prisma.$executeRaw`
        DELETE FROM "ConsumedConfirmationToken"
        WHERE "expiresAt" <= ${new Date()}
      `;
      const inserted = await prisma.$queryRaw<Array<{ tokenHash: string }>>`
        INSERT INTO "ConsumedConfirmationToken" ("tokenHash", "expiresAt")
        VALUES (${tokenHash}, ${expiresAt})
        ON CONFLICT ("tokenHash") DO NOTHING
        RETURNING "tokenHash"
      `;
      return inserted.length === 1;
    } catch (error) {
      console.warn("[AGFusion][Confirmation] persistent token consumption failed closed", error);
      return false;
    }
  }

  // Production must not silently fall back to per-instance replay protection.
  if (process.env.NODE_ENV === "production") return false;

  const now = Math.floor(Date.now() / 1000);
  for (const [usedToken, expiry] of consumedTokens) {
    if (expiry <= now) consumedTokens.delete(usedToken);
  }
  if (consumedTokens.has(token)) return false;
  const dot = token.lastIndexOf(".");
  try {
    const payload = JSON.parse(Buffer.from(token.slice(0, dot), "base64url").toString("utf8")) as ConfirmationPayload;
    consumedTokens.set(token, payload.exp);
    return true;
  } catch {
    return false;
  }
}
