# AGFusion quote-session D1 Worker

This Worker stores only SHA-256 digests of encrypted quote-session tokens. The Next.js application never sends the raw token to this service.

## Current deployment

Provisioned on 2026-11-09:

- D1: `agfusion-quote-sessions`, ID `1e10c8f3-2dbe-4574-b599-65fe690d17b5`.
- Worker: `agfusion-quote-session-store`.
- URL: `https://agfusion-quote-session-store.sayedhasan01740.workers.dev`.
- Binding: D1 as `DB`; secret `API_TOKEN`.
- Cron: `17 * * * *`.

The database table and two indexes have been applied. The Worker secret is write-only; rotate it to a new random value in Cloudflare, then enter the same value directly into the Vercel Preview variable `AGFUSION_QUOTE_SESSION_STORE_TOKEN`. Add a separate random `AGFUSION_QUOTE_SESSION_SECRET` in Vercel Preview. Both variables must target branch `feature/arc-quote-session-d1-worker-20261109`. Do not put either secret in Git or chat.

The Vercel Preview branch already has the Worker URL and `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`. Remote Worker HTTP/concurrency tests remain pending.

## Provision and deploy (for a fresh account or replacement Worker)

1. Create a dedicated D1 database named `agfusion-quote-sessions` only if absent.
2. Add its ID to `wrangler.toml`.
3. Apply the schema:
   ```bash
   npx wrangler d1 execute agfusion-quote-sessions --remote --file=./schema.sql
   ```
4. Set a new Worker secret:
   ```bash
   npx wrangler secret put API_TOKEN
   ```
5. Deploy:
   ```bash
   npx wrangler deploy
   ```

Never set these values in Production until a separate security review and release decision. Keep the API token server-only. The Worker has no browser CORS access and requires bearer authentication on every request.

## API

- `POST /v1/sessions/register`: inserts token digest, lowercase account, Arc chain ID 5042, and expiry.
- `POST /v1/sessions/consume`: atomically claims an unexpired, unconsumed row using one conditional SQL UPDATE. Exactly one request can update a given row; replays return HTTP 409.
- Storage failures return HTTP 503. Requests are bounded to 4 KiB. Session lifetime is capped at 300 seconds.

The Worker is dedicated to replay protection only. AGFusion's other application data still uses the existing Prisma/PostgreSQL data layer; this change does not migrate users, transactions, or x402 records.
