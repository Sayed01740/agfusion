import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";

const COOKIE = "AGFusion_session";
const SESSION_DAYS = 7;
const FALLBACK_PREFIX = "signed_";

type SignedSessionPayload = {
  address: string;
  exp: number;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "agfusion-local-dev-session-secret-change-me";
  }
  throw new Error("AUTH_SECRET is required for signed fallback sessions in production.");
}

function encodePayload(payload: SignedSessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encoded: string): string {
  return createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
}

function createSignedFallback(address: string): string {
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Cannot create a session for an invalid wallet address.");
  }
  const payload = encodePayload({
    address: normalized,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
  });
  return `${FALLBACK_PREFIX}${payload}.${signPayload(payload)}`;
}

function verifySignedFallback(token: string): string | null {
  if (!token.startsWith(FALLBACK_PREFIX)) return null;
  const value = token.slice(FALLBACK_PREFIX.length);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  try {
    const expected = signPayload(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedSessionPayload;
    if (!decoded || typeof decoded.address !== "string" || typeof decoded.exp !== "number") return null;
    if (decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!/^0x[a-f0-9]{40}$/.test(decoded.address.toLowerCase())) return null;
    return decoded.address.toLowerCase();
  } catch {
    return null;
  }
}

export async function createSession(userId: string, address?: string): Promise<string> {
  const addr = (address || userId.replace(/^mem_/, "")).toLowerCase();

  if (isDbConfigured() && !userId.startsWith("mem_")) {
    try {
      const prisma = getPrisma();
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
      await prisma.session.create({
        data: {
          userId,
          token: hashToken(token),
          expiresAt,
        },
      });
      return token;
    } catch (e) {
      console.warn("[session] DB create failed; using signed wallet-bound fallback", e);
    }
  }

  return createSignedFallback(addr);
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<{ id: string; address: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const signedAddress = verifySignedFallback(token);
  if (signedAddress) {
    return { id: "signed", address: signedAddress };
  }

  if (!isDbConfigured()) return null;

  try {
    const prisma = getPrisma();
    const session = await prisma.session.findUnique({
      where: { token: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      return null;
    }
    return { id: session.user.id, address: session.user.address };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && isDbConfigured() && !token.startsWith(FALLBACK_PREFIX)) {
    try {
      await getPrisma().session.deleteMany({ where: { token: hashToken(token) } });
    } catch {
      /* ignore */
    }
  }
  await clearSessionCookie();
}
