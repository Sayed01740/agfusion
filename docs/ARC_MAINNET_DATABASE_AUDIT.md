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

Cloudflare account access was used on 2026-11-09 to provision and verify:

- D1 database `agfusion-quote-sessions` (`1e10c8f3-2dbe-4574-b599-65fe690d17b5`).
- Table `arc_quote_sessions` and indexes `arc_quote_sessions_expires_at_idx` and `arc_quote_sessions_account_expires_at_idx`.
- Worker `agfusion-quote-session-store` at `https://agfusion-quote-session-store.sayedhasan01740.workers.dev`.
- D1 binding `DB`, write-only Worker secret binding `API_TOKEN`, and hourly cleanup cron.
- Vercel Preview-only Worker URL and `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false` for branch `feature/arc-quote-session-d1-worker-20261109`.

The Worker secret must be rotated by the owner and the matching value entered directly into Vercel Preview as `AGFUSION_QUOTE_SESSION_STORE_TOKEN`. The separate `AGFUSION_QUOTE_SESSION_SECRET` must also be created in Vercel Preview. Secret values are not included in this repository or chat. Remote Worker HTTP and concurrent-consume tests remain pending.

## Safety boundary

- Keep `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
- Do not reuse Production credentials for Preview.
- Do not merge, promote, sign, or broadcast Mainnet transactions as part of this work.
- Keep PR #57 in Draft until D1 is provisioned, deployed, remotely tested, and the remaining Mainnet release gates are independently reviewed.
