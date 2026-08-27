import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function isPostgresUrl(value: string | undefined): value is string {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
  ];
  return candidates.find(isPostgresUrl);
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = resolveDatabaseUrl();
    if (!url) throw new Error("Production PostgreSQL database URL is not configured or is invalid. Expected postgres:// or postgresql:// from the connected Vercel Postgres integration.");
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export function isDbConfigured(): boolean { return Boolean(resolveDatabaseUrl()); }
export function getDatabaseTarget(): "postgres" | "missing" { return resolveDatabaseUrl() ? "postgres" : "missing"; }
