import { spawnSync } from "node:child_process";

function isPostgresUrl(value) {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

const pooledCandidates = [
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL_NON_POOLING,
];

const directCandidates = [
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  process.env.POSTGRES_PRISMA_URL,
];

const pooledUrl = pooledCandidates.find(isPostgresUrl);
const directUrl = directCandidates.find(isPostgresUrl);

if (!pooledUrl || !directUrl) {
  throw new Error(
    "Production PostgreSQL database is not configured. A postgres:// or postgresql:// connection URL is required.",
  );
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      POSTGRES_PRISMA_URL: pooledUrl,
      POSTGRES_URL_NON_POOLING: directUrl,
      DATABASE_URL: pooledUrl,
    },
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Prisma production schema sync failed with exit code ${result.status}.`);
}
