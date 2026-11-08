# AGFusion database and persistent-storage audit

**Audit date:** 2026-11-09  
**Scope:** Repository configuration and the connected Vercel project metadata. No database credentials or stored application records were read or changed.

## Findings

1. The repository's Prisma datasource is configured with `provider = "postgresql"`.
2. The Prisma schema already contains application models for users, sessions, transactions, agent runs, x402 payments/challenges, and Arc quote sessions. This is an existing PostgreSQL-oriented data model in code; it does not prove that a PostgreSQL service is provisioned or reachable.
3. The runtime resolver in `src/lib/db.ts` accepts `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, and `POSTGRES_URL_NON_POOLING`. It intentionally does not fall back to `DATABASE_URL`.
4. The Vercel project metadata exposes a Production `DATABASE_URL`, but its value was not inspected or disclosed. Its provider and engine therefore remain unverified. It must not be repurposed for Preview.
5. No Preview environment variables are scoped to `feature/arc-quote-session-replay-guard-20261108`.
6. The connected Vercel project reports no project-level integration configurations and no Edge Config stores. No existing managed durable key-value store was found through those project metadata surfaces.
7. No Neon connection is assumed or required by this audit.

## Decision

Do not create a Neon project, add a new paid service, or point Preview at Production without an explicit infrastructure choice and authorization.

The current atomic quote-session replay guard uses Prisma's PostgreSQL `updateMany` conditional write. It cannot safely be replaced with in-memory state, browser storage, Edge Config reads, or a non-atomic read-then-write check.

Before enabling database-backed Preview validation, choose and provision an isolated durable store that supports atomic conditional writes. If the chosen provider is PostgreSQL, configure branch-scoped Preview connection variables and apply the checked-in Prisma migration using `prisma migrate deploy`. Keep Production credentials separate.

## Release boundary

- Keep `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
- Keep the PR in Draft until an isolated Preview store is available and runtime validation passes.
- Do not merge, promote, sign, or broadcast Mainnet transactions as part of this audit.
