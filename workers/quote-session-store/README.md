# AGFusion quote-session D1 Worker

This Worker stores only SHA-256 digests of encrypted quote-session tokens. The Next.js application never sends the raw token to this service.

## Provision and deploy

1. In the Cloudflare account, create a dedicated D1 database named `agfusion-quote-sessions`.
2. Replace the placeholder `database_id` in `wrangler.toml` with the ID returned by Cloudflare. Do not commit account secrets.
3. Create a random API token with at least 32 characters and store it as a Worker secret:
   ```bash
   npx wrangler secret put API_TOKEN
   ```
4. Apply the schema:
   ```bash
   npx wrangler d1 execute agfusion-quote-sessions --remote --file=./schema.sql
   ```
5. Deploy:
   ```bash
   npx wrangler deploy
   ```
6. Configure the Vercel Preview branch with:
   - `AGFUSION_QUOTE_SESSION_STORE_URL=https://<deployed-worker-host>`
   - `AGFUSION_QUOTE_SESSION_STORE_TOKEN=<same API_TOKEN>`
   - `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`

Never set these values in Production until a separate security review and release decision. Keep the API token server-only. The Worker has no browser CORS access and requires bearer authentication on every request.

## API

- `POST /v1/sessions/register`: inserts token digest, lowercase account, Arc chain ID 5042, and expiry.
- `POST /v1/sessions/consume`: atomically claims an unexpired, unconsumed row using one conditional SQL UPDATE. Exactly one request can update a given row; replays return HTTP 409.
- Storage failures return HTTP 503. Requests are bounded to 4 KiB. Session lifetime is capped at 300 seconds.

The Worker is dedicated to replay protection only. AGFusion's other application data still uses the existing Prisma/PostgreSQL data layer; this change does not migrate users, transactions, or x402 records.
