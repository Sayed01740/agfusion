import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";

const COOKIE = "AGFusion_session";
const SESSION_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(
  userId: string,
  address?: string,
): Promise<string> {
  const addr = (address || userId.replace(/^mem_/, "")).toLowerCase();
  const ephemeral = () =>
    `ephemeral_${addr.startsWith("0x") ? addr : userId.replace(/^mem_/, "")}`;

  if (!isDbConfigured() || userId.startsWith("mem_")) {
    return ephemeral();
  }
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
    console.warn("[session] DB create failed, ephemeral session", e);
    return ephemeral();
  }
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
    // Prevent JS access + limit cookie to our origin path
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<{
  id: string;
  address: string;
} | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  if (token.startsWith("ephemeral_")) {
    const address = token.slice("ephemeral_".length).toLowerCase();
    if (address.startsWith("0x") && address.length === 42) {
      return { id: "ephemeral", address };
    }
    return null;
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
  if (token && isDbConfigured() && !token.startsWith("ephemeral_")) {
    try {
      await getPrisma().session.deleteMany({
        where: { token: hashToken(token) },
      });
    } catch {
      /* ignore */
    }
  }
  await clearSessionCookie();
}
