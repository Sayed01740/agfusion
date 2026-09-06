import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { verifyMessage } from "viem";
import { getPrisma, isDbConfigured } from "@/lib/db";

/** EIP-4361 (SIWE) helpers. */

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_SIWE_CHAIN_ID || 5042002);

export const SIWE_STATEMENT =
  "Sign in to AGFusion. This request will not trigger a blockchain transaction or cost any fees.";

const NONCE_TTL_MS = 10 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const memNonces = new Map<string, { address: string; expiresAt: Date }>();
const usedNonces = new Map<string, number>();

export type SiweOrigin = {
  domain: string;
  uri: string;
};

const DEV_FALLBACK_SECRET = "agfusion-dev-siwe-secret-change-me";

function authSecret(): string {
  const explicit =
    process.env.AUTH_SECRET?.trim() || process.env.SIWE_SECRET?.trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("AUTH_SECRET is not configured in production");
  }

  return (
    process.env.BAZAARLINK_API_KEY?.trim() ||
    process.env.KIT_KEY?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    DEV_FALLBACK_SECRET
  );
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function resolveSiweOrigin(req: Request): SiweOrigin {
  const headers = req.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host =
    forwardedHost ||
    headers.get("host")?.trim() ||
    process.env.NEXT_PUBLIC_APP_DOMAIN?.trim() ||
    "localhost:3000";

  const protoHeader = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    protoHeader ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");

  const domain = host;
  const envUri = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let uri = `${proto}://${host}`;

  if (envUri) {
    try {
      const u = new URL(envUri);
      if (u.host === host || u.hostname === host.split(":")[0]) {
        uri = envUri.replace(/\/$/, "");
      }
    } catch {
      // Keep the request-derived URI.
    }
  }

  return { domain, uri };
}

export function isAllowedSiweDomain(domain: string): boolean {
  const d = domain.toLowerCase().split(":")[0];
  const allowed = new Set<string>([
    "localhost",
    "127.0.0.1",
    "agfusion.vercel.app",
  ]);
  const envDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.toLowerCase().trim();
  if (envDomain) allowed.add(envDomain.split(":")[0]);

  if (d.endsWith(".vercel.app") && d.includes("agfusion")) return true;
  return allowed.has(d);
}

export function buildSiweMessage(params: {
  address: string;
  nonce: string;
  domain: string;
  uri: string;
  chainId?: number;
  issuedAt?: string;
  expirationTime?: string;
}): string {
  const issuedAt = params.issuedAt || new Date().toISOString();
  const expirationTime =
    params.expirationTime ||
    new Date(Date.now() + NONCE_TTL_MS).toISOString();
  const chainId = params.chainId ?? CHAIN_ID;

  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${params.uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join("\n");
}

/** Issue a cryptographically random, HMAC-bound, one-time SIWE nonce. */
export async function issueNonce(address: string): Promise<string> {
  const addr = address.toLowerCase();
  const nonce = `${Date.now().toString(36)}_${randomBytes(8).toString("hex")}_${randomBytes(16).toString("hex")}`;
  const [ts, rand] = nonce.split("_");
  const payload = `${addr}.${ts}.${rand}`;
  const sig = createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  const signedNonce = `${ts}_${rand}_${sig}`;
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  if (isDbConfigured()) {
    try {
      const prisma = getPrisma();
      await prisma.authNonce.create({
        data: { address: addr, nonce: signedNonce, expiresAt },
      });
    } catch (error) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
        throw new Error("Could not persist SIWE nonce");
      }
      console.warn("[siwe] DB nonce store skipped", error);
    }
  } else if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Database is required for production SIWE replay protection");
  }

  memNonces.set(signedNonce, { address: addr, expiresAt });
  return signedNonce;
}

function verifySignedNonceFormat(address: string, nonce: string): boolean {
  const parts = nonce.split("_");
  if (parts.length !== 3) return false;
  const [ts, rand, sig] = parts;
  if (!/^[a-z0-9]+$/.test(ts)) return false;
  if (!/^[a-f0-9]{16}$/.test(rand)) return false;
  if (!/^[a-f0-9]{24}$/.test(sig)) return false;

  const payload = `${address.toLowerCase()}.${ts}.${rand}`;
  const expected = createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  if (!safeEqualHex(sig, expected)) return false;

  const issued = parseInt(ts, 36);
  if (!Number.isFinite(issued)) return false;
  const now = Date.now();
  if (issued < now - NONCE_TTL_MS || issued > now + MAX_CLOCK_SKEW_MS) return false;
  return true;
}

/** Atomically consume a nonce. Production uses the database as the source of truth. */
export async function consumeNonce(address: string, nonce: string): Promise<boolean> {
  const addr = address.toLowerCase();
  if (!verifySignedNonceFormat(addr, nonce)) return false;

  if (isDbConfigured()) {
    try {
      const prisma = getPrisma();
      const result = await prisma.authNonce.deleteMany({
        where: {
          address: addr,
          nonce,
          expiresAt: { gt: new Date() },
        },
      });
      return result.count === 1;
    } catch (error) {
      console.error("[siwe] atomic nonce consume failed", error);
      return false;
    }
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return false;
  }

  if (usedNonces.has(nonce)) return false;
  const mem = memNonces.get(nonce);
  if (!mem || mem.address !== addr || mem.expiresAt < new Date()) return false;

  usedNonces.set(nonce, Date.now());
  memNonces.delete(nonce);

  if (usedNonces.size > 5000) {
    const cutoff = Date.now() - 15 * 60_000;
    for (const [key, time] of usedNonces) {
      if (time < cutoff) usedNonces.delete(key);
    }
  }
  return true;
}

export function extractNonceFromMessage(message: string): string | null {
  const m = message.match(/^Nonce:\s*([a-zA-Z0-9_]+)\s*$/m);
  return m?.[1] || null;
}

export function extractAddressFromMessage(message: string): string | null {
  const m = message.match(/^0x[a-fA-F0-9]{40}$/m);
  return m?.[0] || null;
}

export function extractDomainFromMessage(message: string): string | null {
  const m = message.match(
    /^(.+?) wants you to sign in with your Ethereum account:/m,
  );
  return m?.[1]?.trim() || null;
}

export function extractUriFromMessage(message: string): string | null {
  const m = message.match(/^URI:\s*(.+)\s*$/m);
  return m?.[1]?.trim() || null;
}

export function extractExpirationFromMessage(message: string): string | null {
  const m = message.match(/^Expiration Time:\s*(.+)\s*$/m);
  return m?.[1]?.trim() || null;
}

export function extractIssuedAtFromMessage(message: string): string | null {
  const m = message.match(/^Issued At:\s*(.+)\s*$/m);
  return m?.[1]?.trim() || null;
}

export function extractChainIdFromMessage(message: string): number | null {
  const m = message.match(/^Chain ID:\s*(\d+)\s*$/m);
  if (!m) return null;
  const chainId = Number(m[1]);
  return Number.isSafeInteger(chainId) ? chainId : null;
}

export async function verifySiwe(params: {
  message: string;
  signature: `0x${string}`;
  expectedDomain?: string;
  expectedUri?: string;
}): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const address = extractAddressFromMessage(params.message);
  if (!address) return { ok: false, error: "No address in message" };

  const domain = extractDomainFromMessage(params.message);
  if (!domain || !isAllowedSiweDomain(domain)) {
    return { ok: false, error: "Untrusted sign-in domain" };
  }

  if (params.expectedDomain) {
    const expected = params.expectedDomain.toLowerCase();
    const actual = domain.toLowerCase();
    if (
      expected !== actual &&
      expected.split(":")[0] !== actual.split(":")[0]
    ) {
      return { ok: false, error: "Domain mismatch" };
    }
  }

  const uri = extractUriFromMessage(params.message);
  if (!uri) return { ok: false, error: "No URI in message" };
  if (params.expectedUri && uri !== params.expectedUri) {
    return { ok: false, error: "URI mismatch" };
  }

  const chainId = extractChainIdFromMessage(params.message);
  if (chainId !== CHAIN_ID) return { ok: false, error: "Chain ID mismatch" };

  const issuedAt = extractIssuedAtFromMessage(params.message);
  if (!issuedAt || !Number.isFinite(Date.parse(issuedAt))) {
    return { ok: false, error: "Invalid issued-at time" };
  }
  if (Date.parse(issuedAt) > Date.now() + MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: "Sign-in message issued in the future" };
  }

  const expiration = extractExpirationFromMessage(params.message);
  if (!expiration) return { ok: false, error: "No expiration time" };
  const expiresAt = Date.parse(expiration);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, error: "Sign-in message expired" };
  }

  const nonce = extractNonceFromMessage(params.message);
  if (!nonce) return { ok: false, error: "No nonce in message" };

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message: params.message,
      signature: params.signature,
    });
    if (!valid) return { ok: false, error: "Invalid signature" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }

  // Consume only after signature verification so an attacker cannot burn a
  // legitimate user's nonce with an invalid signature.
  const nonceOk = await consumeNonce(address, nonce);
  if (!nonceOk) return { ok: false, error: "Invalid or already-used nonce" };

  return { ok: true, address: address.toLowerCase() };
}

export async function upsertUser(
  address: string,
): Promise<{ id: string; address: string }> {
  const addr = address.toLowerCase();
  if (!isDbConfigured()) return { id: `mem_${addr}`, address: addr };

  try {
    const prisma = getPrisma();
    const user = await prisma.user.upsert({
      where: { address: addr },
      create: { address: addr },
      update: {},
    });
    return { id: user.id, address: user.address };
  } catch (error) {
    console.warn("[siwe] upsertUser DB failed, memory user", error);
    return { id: `mem_${addr}`, address: addr };
  }
}
