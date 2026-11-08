# AGFusion database and persistent-storage audit

**Audit date:** 2026-11-09  
**Scope:** Repository configuration and connected Vercel project metadata. No database credentials or stored application records were read or changed.

## Existing application database

1. AGFusion's Prisma datasource remains configured for PostgreSQL.
2. The Prisma schema contains application models for users, sessions, transactions, x402 payments/challenges, and agent runs.
3. The runtime resolver in `src/lib/db.ts` accepts `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, and `POSTGRES_URL_NON_POOLING`; it intentionally does not fall back to legacy `DATABASE_URL`.
4. The Vercel project exposes a Production `DATABASE_URL`, but its provider/engine was not verified and its value was not disclosed. It must not be reused for Preview.
5. No Preview database variables were scoped to the earlier replay-guard branch. No project-level integration configuration or Edge Config store was found.

## Replay-protection storage decision

The one-time Arc quote-session claim has been separated from Prisma and implemented as a dedicated Cloudflare D1 Worker:

- The app sends only a SHA-256 token digest to the Worker over HTTPS with a server-only bearer token.
- D1 stores only the digest, normalized account, fixed chain ID 5042, expiry, and consumed timestamp.
- A single conditional SQL UPDATE is the atomic consume boundary. A successful update changes exactly one row; replays return HTTP 409.
- D1 errors, network timeouts, and missing configuration fail closed with HTTP 503.
- The D1 Worker does not replace Prisma/PostgreSQL for AGFusion's other application data.

## Provisioning status

The repository now contains Worker source, D1 schema, Wrangler configuration template, application client, unit tests, and a provisioning guide. No Cloudflare account connection is available through the current connected tools, and no D1 database ID, Worker secret, Worker deployment, or Vercel Preview secret has been provisioned. Remote D1 concurrency validation remains pending.

## Safety boundary

- Keep `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
- Do not reuse Production credentials for Preview.
- Do not merge, promote, sign, or broadcast Mainnet transactions as part of this work.
- Keep PR #57 in Draft until D1 is provisioned, deployed, remotely tested, and the remaining Mainnet release gates are independently reviewed.
