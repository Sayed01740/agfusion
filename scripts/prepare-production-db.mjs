import { spawnSync } from "node:child_process";

function isPostgresUrl(value) {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

const candidates = [
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
];

const databaseUrl = candidates.find(isPostgresUrl);

if (!databaseUrl) {
  throw new Error(
    "Production PostgreSQL database is not configured. Connect the existing Postgres database and expose a postgres:// or postgresql:// connection URL.",
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
