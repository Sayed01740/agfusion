import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Vercel integrations have historically exposed Prisma/Postgres URLs under
 * more than one environment-variable name. Prefer the pooled Prisma URL when
 * it exists, then fall back to the canonical DATABASE_URL used by Prisma
 * Postgres. This prevents an old SQLite/DATABASE_URL value from silently
 * winning after a Postgres integration is attached to the project.
 */
function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL
  );
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = resolveDatabaseUrl();
    if (!url) {
      throw new Error("Production database URL is not configured.");
    }

    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url } },
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

/** True when at least one supported production database URL is configured. */
export function isDbConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export function getDatabaseTarget(): "postgres" | "missing" {
  const url = resolveDatabaseUrl();
  if (!url) return "missing";
  return "postgres";
}
