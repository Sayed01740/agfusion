# AGFusion Arc quote-session D1 Worker runbook

## Scope

Cloudflare D1 is used only for one-time Arc Mainnet quote-session replay protection. It does not replace AGFusion's existing Prisma/PostgreSQL application data layer (users, transactions, x402, and other records).

The Worker stores only the SHA-256 digest of the opaque encrypted quote-session token, normalized wallet account, fixed Arc chain ID 5042, expiry, and consumption timestamp. The raw token, quote payload, Permit2 payload, signatures, and wallet secrets are never sent to D1.

## Provision and deploy

1. In the Cloudflare account, create a dedicated D1 database named `agfusion-quote-sessions`.
2. Copy the returned database ID into `workers/quote-session-store/wrangler.toml` in place of `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`.
3. From `workers/quote-session-store`, apply the schema:
   ```bash
   npx wrangler d1 execute agfusion-quote-sessions --remote --file=./schema.sql
   ```
4. Generate a random API token of at least 32 characters and save it as a Worker secret:
   ```bash
   npx wrangler secret put API_TOKEN
   ```
5. Deploy the Worker:
   ```bash
   npx wrangler deploy
   ```
6. Configure Vercel **Preview only**, scoped to `feature/arc-quote-session-d1-worker-20261109`:
   - `AGFUSION_QUOTE_SESSION_STORE_URL`: the deployed HTTPS Worker origin, without a path or query string.
   - `AGFUSION_QUOTE_SESSION_STORE_TOKEN`: the exact secret set as `API_TOKEN` on the Worker.
   - `AGFUSION_QUOTE_SESSION_SECRET`: unique random AES-256-GCM quote-session secret, at least 32 characters.
   - `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
   - `UNISWAP_API_KEY`: Preview-only key only if quote preview is being validated.

Never put the Worker token in a `NEXT_PUBLIC_*` variable or browser code. Do not add these settings to Production until a separate security review and explicit release decision. The Worker endpoint requires bearer authentication and the Next.js client rejects non-HTTPS URLs.

## Atomic replay boundary

- Registration is a parameterized D1 INSERT with a unique primary key on `token_hash`.
- Consumption is one parameterized conditional UPDATE requiring matching token hash, account, chain ID 5042, unexpired timestamp, and `consumed_at IS NULL`.
- D1 reports the number of changed rows. Exactly one row means the session was consumed; zero rows returns HTTP 409.
- Storage outage, timeout, missing configuration, or Worker error fails closed with HTTP 503.
- Quote sessions are capped at 300 seconds by the Worker; the application currently issues 60-second sessions.
- A scheduled Worker trigger removes expired rows older than 24 hours in bounded batches.

All SQL values are bound through prepared statements. No SQL string interpolation is used.

## Validation checklist

1. Apply the D1 schema to the dedicated database and deploy the Worker.
2. Configure only the Preview branch variables above.
3. Confirm quote registration succeeds and that the Worker database contains a 64-character digest, not the raw quote token.
4. Send two concurrent consume requests for the same session. Exactly one must return success; the other must return HTTP 409.
5. Verify wrong account, wrong chain, expired session, duplicate consume, missing API token, and D1 outage all fail closed.
6. Verify the Next.js quote endpoint returns HTTP 503 when the Worker is unreachable.
7. Keep `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`; this work does not authorize transaction preparation, wallet signing, or broadcast.

## Current deployment status

The repository includes Worker source, D1 schema, Wrangler configuration template, application client, and unit tests. A real Cloudflare database ID, Worker API secret, Worker deployment, Vercel Preview secrets, and remote D1 concurrency test are not present yet. Those require the owner's Cloudflare account access and must not be represented as completed.

## Remaining Mainnet release gates

Wallet approval/Permit2/swap orchestration UI, user-facing transaction confirmations, wallet chain/account revalidation immediately before each wallet prompt, wallet signing, transaction broadcast, post-submission tracking, live liquidity validation, and independent security review remain incomplete. Mainnet preparation remains disabled.
