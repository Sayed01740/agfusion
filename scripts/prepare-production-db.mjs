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

// Database schema synchronization is a deployment-time concern. A Vercel build
// must remain reproducible even when database integration variables are not
// exposed to the build environment. Runtime database access still requires the
// application's configured DATABASE_URL/POSTGRES_* variables.
if (!pooledUrl || !directUrl) {
  console.warn(
    "[AGFusion] PostgreSQL build-time schema sync skipped: no POSTGRES_PRISMA_URL/POSTGRES_URL/DATABASE_URL connection URL is configured for this build.",
  );
  process.exit(0);
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
