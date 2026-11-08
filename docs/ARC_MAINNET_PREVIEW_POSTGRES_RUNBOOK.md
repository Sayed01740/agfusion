# PostgreSQL application database notes

The Arc quote-session replay guard no longer uses Prisma/PostgreSQL. It now uses the dedicated Cloudflare D1 Worker described in [the D1 Worker runbook](./ARC_MAINNET_D1_WORKER_RUNBOOK.md).

AGFusion still has an existing Prisma/PostgreSQL application data layer for other records such as users, sessions, transactions, and x402 data. This change does not migrate or replace those application records.

Do not use a Production database credential for Preview. If a future task requires Preview validation of other Prisma-backed application features, provision a separate Preview PostgreSQL database and scope its credentials to that Preview branch only. Never run `prisma db push --accept-data-loss` or migrations against Production as part of this quote-session replay-protection work.
