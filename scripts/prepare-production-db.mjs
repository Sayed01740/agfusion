import { spawnSync } from "node:child_process";

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error(
    "Production database is not configured. Connect the existing Postgres database and expose DATABASE_URL (or POSTGRES_PRISMA_URL/POSTGRES_URL).",
  );
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Prisma production schema sync failed with exit code ${result.status}.`);
}
