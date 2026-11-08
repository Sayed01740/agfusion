# Arc Mainnet Preview PostgreSQL Runbook

This runbook provisions an isolated database for the Arc Mainnet quote-session replay-protection Preview branch. It must never point at Production.

## 1. Provision an isolated database

Create a dedicated PostgreSQL project/database for AGFusion Preview (Neon is one supported option). Keep it separate from the Production database and use a dedicated database role with only the privileges needed by the application and Prisma migrations.

Obtain two PostgreSQL URLs:
- `POSTGRES_PRISMA_URL`: pooled/runtime connection URL.
- `POSTGRES_URL_NON_POOLING`: direct connection URL for Prisma migrations.

Do not copy Production credentials into Preview. Do not commit either URL to Git.

## 2. Configure Vercel Preview variables

In the `agfusion` Vercel project, add the following variables with target **Preview** and Git branch scope:

- `POSTGRES_PRISMA_URL`: pooled Preview connection URL.
- `POSTGRES_URL_NON_POOLING`: direct Preview connection URL.
- `AGFUSION_QUOTE_SESSION_SECRET`: unique random secret, at least 32 characters, used only for this Preview environment.
- `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED`: `false`.
- `UNISWAP_API_KEY`: Preview-only Uniswap API key, if quote smoke tests are required.

Scope the variables to `feature/arc-quote-session-replay-guard-20261108` while validating this PR. Do not add these variables to Production or Development. Do not use `DATABASE_URL` as a substitute for the two Prisma variables above.

## 3. Apply the migration

Run from the repository root in a controlled environment with the two Preview URLs loaded:

```bash
npx prisma generate
npx prisma migrate deploy
```

The migration should create only `ArcQuoteSession` and its indexes. Verify the migration status:

```bash
npx prisma migrate status
```

Do not use `prisma db push --accept-data-loss` for this migration. Do not run schema changes against Production as part of Preview validation.

## 4. Validate Preview

After Vercel has produced a new Preview deployment for the scoped branch:

1. Confirm the deployment references the expected branch and commit.
2. Confirm the Preview runtime resolves a PostgreSQL URL and can register a quote-session digest.
3. Run the disposable PostgreSQL integration workflow and the Preview-specific database smoke test.
4. Verify a fresh session can be consumed exactly once and a concurrent replay returns HTTP 409.
5. Verify unavailable database storage fails closed with HTTP 503.
6. Confirm `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false` remains in effect.

## 5. Release boundary

A successful Preview migration and smoke test do not authorize Mainnet execution. Wallet approval UI, Permit2 signing flow, explicit transaction review, wallet chain/account revalidation immediately before signing, transaction submission, receipt UI, independent security review, and a separate release approval remain required.

Never promote this Preview deployment to Production or enable the Mainnet preparation flag as part of this runbook.
