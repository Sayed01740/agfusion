import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { verifyMessage } from "viem";
import { getPrisma, isDbConfigured } from "@/lib/db";

/**
 * EIP-4361 (SIWE) helpers.
 * Nonces are HMAC-signed so they work on Vercel serverless even when
 * SQLite/Postgres is missing or misconfigured (was causing /api/auth/nonce 500).
 */

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_SIWE_CHAIN_ID || 5042002);

/** Safe statement — MetaMask-recommended phrasing: not a tx, no fees */
export const SIWE_STATEMENT =
  "Sign in to AGFusion. This request will not trigger a blockchain transaction or cost any fees.";

const memNonces = new Map<string, { address: string; expiresAt: Date }>();
/** Replay protection within a single instance */
const usedNonces = new Map<string, number>();

export type SiweOrigin = {
  /** Host only, no protocol — e.g. agfusion.vercel.app */
  domain: string;
  /** Full origin — e.g. https://agfusion.vercel.app */
  uri: string;
};

const DEV_FALLBACK_SECRET = "agfusion-dev-siwe-secret-change-me";

function authSecret(): string {
  const explicit =
    process.env.AUTH_SECRET?.trim() || process.env.SIWE_SECRET?.trim();
  if (explicit) return explicit;

  // Production must FAIL CLOSED: without a real AUTH_SECRET/SIWE_SECRET the
  // HMAC nonce would be predictable from weaker fallbacks or a public literal.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("AUTH_SECRET is not configured in production");
  }

  // Development convenience only.
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

/**
 * Resolve domain/URI from the incoming request so the SIWE message
 * always matches the page the user is on (avoids domain-mismatch risk UI).
 */
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
      /* keep derived uri */
    }
  }

  return { domain, uri };
}

/** Allowed domains for SIWE verification (anti-phishing). */
export function isAllowedSiweDomain(domain: string): boolean {
  const d = domain.toLowerCase().split(":")[0];
  const allowed = new Set<string>([
    "localhost",
    "127.0.0.1",
    "agfusion.vercel.app",
  ]);
  const envDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.toLowerCase().trim();
  if (envDomain) {
    allowed.add(envDomain.split(":")[0]);
  }
  // Preview deployments: *.vercel.app under same project name
  if (d.endsWith(".vercel.app") && d.includes("agfusion")) {
    return true;
  }
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
    new Date(Date.now() + 10 * 60_000).toISOString();
  const chainId = params.chainId ?? CHAIN_ID;
  const address = params.address;

  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${params.uri}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join("\n");
}

/**
 * Issue a signed nonce that validates without a database.
 * Format: <ts36>_<rand>_<hmac24>
 */
export async function issueNonce(address: string): Promise<string> {
  const addr = address.toLowerCase();
  const ts = Date.now().toString(36);
  const rand = randomBytes(8).toString("hex");
  const payload = `${addr}.${ts}.${rand}`;
  const sig = createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  const nonce = `${ts}_${rand}_${sig}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  // Best-effort persist (never fail the request if DB is broken)
  memNonces.set(nonce, { address: addr, expiresAt });
  if (isDbConfigured()) {
    try {
      const prisma = getPrisma();
      await prisma.authNonce.create({
        data: { address: addr, nonce, expiresAt },
      });
    } catch (e) {
      console.warn("[siwe] DB nonce store skipped", e);
    }
  }

  return nonce;
}

function verifySignedNonce(address: string, nonce: string): boolean {
  const parts = nonce.split("_");
  if (parts.length !== 3) return false;
  const [ts, rand, sig] = parts;
  if (!ts || !rand || !sig || sig.length !== 24) return false;

  const addr = address.toLowerCase();
  const payload = `${addr}.${ts}.${rand}`;
  const expected = createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  if (!safeEqualHex(sig, expected)) return false;

  const issued = parseInt(ts, 36);
  if (!Number.isFinite(issued)) return false;
  if (Date.now() - issued > 10 * 60_000) return false;
  if (issued > Date.now() + 60_000) return false; // clock skew

  // In-instance replay protection
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, Date.now());
  // prune old
  if (usedNonces.size > 5000) {
    const cutoff = Date.now() - 15 * 60_000;
    for (const [k, t] of usedNonces) {
      if (t < cutoff) usedNonces.delete(k);
    }
  }
  return true;
}

export async function consumeNonce(
  address: string,
  nonce: string,
): Promise<boolean> {
  const addr = address.toLowerCase();

  // Prefer HMAC verification (works across serverless instances)
  if (nonce.includes("_") && nonce.split("_").length === 3) {
    const ok = verifySignedNonce(addr, nonce);
    if (!ok) return false;
    // Best-effort DB delete
    if (isDbConfigured()) {
      try {
        const prisma = getPrisma();
        await prisma.authNonce.deleteMany({ where: { address: addr, nonce } });
      } catch {
        /* ignore */
      }
    }
    memNonces.delete(nonce);
    return true;
  }

  // Legacy mem / DB nonces
  if (isDbConfigured()) {
    try {
      const prisma = getPrisma();
      const row = await prisma.authNonce.findFirst({
        where: { address: addr, nonce },
      });
      if (!row || row.expiresAt < new Date()) return false;
      await prisma.authNonce.delete({ where: { id: row.id } });
      return true;
    } catch (e) {
      console.warn("[siwe] DB consume failed", e);
    }
  }

  const mem = memNonces.get(nonce);
  if (!mem || mem.address !== addr || mem.expiresAt < new Date()) return false;
  memNonces.delete(nonce);
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

export async function verifySiwe(params: {
  message: string;
  signature: `0x${string}`;
  /** Live request origin — must match message domain */
  expectedDomain?: string;
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

  const exp = extractExpirationFromMessage(params.message);
  if (exp) {
    const t = Date.parse(exp);
    if (Number.isFinite(t) && t < Date.now()) {
      return { ok: false, error: "Sign-in message expired" };
    }
  }

  const nonce = extractNonceFromMessage(params.message);
  if (!nonce) return { ok: false, error: "No nonce in message" };

  const nonceOk = await consumeNonce(address, nonce);
  if (!nonceOk) return { ok: false, error: "Invalid or expired nonce" };

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message: params.message,
      signature: params.signature,
    });
    if (!valid) return { ok: false, error: "Invalid signature" };
    return { ok: true, address: address.toLowerCase() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Verification failed",
    };
  }
}

export async function upsertUser(
  address: string,
): Promise<{ id: string; address: string }> {
  const addr = address.toLowerCase();
  if (!isDbConfigured()) {
    return { id: `mem_${addr}`, address: addr };
  }
  try {
    const prisma = getPrisma();
    const user = await prisma.user.upsert({
      where: { address: addr },
      create: { address: addr },
      update: {},
    });
    return { id: user.id, address: user.address };
  } catch (e) {
    console.warn("[siwe] upsertUser DB failed, memory user", e);
    return { id: `mem_${addr}`, address: addr };
  }
}
