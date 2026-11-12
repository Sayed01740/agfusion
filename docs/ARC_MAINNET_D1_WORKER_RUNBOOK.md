# AGFusion Arc quote-session D1 Worker runbook

## Scope and data model

Cloudflare D1 is used only for one-time Arc quote-session replay protection. It does not replace AGFusion's existing Prisma/PostgreSQL application database for users, transactions, x402, or other application records.

The Worker stores only:
- SHA-256 digest of the opaque encrypted quote-session token
- normalized wallet address
- fixed Arc Mainnet chain ID `5042`
- expiry and consumption timestamps

The raw quote token, quote payload, Permit2 payload, signatures, and wallet secrets are not sent to D1.

## Provisioned Cloudflare resources

Verified on 2026-11-09:

| Resource | Current configuration |
|---|---|
| D1 database | `agfusion-quote-sessions` |
| D1 database ID | `1e10c8f3-2dbe-4574-b599-65fe690d17b5` |
| Table | `arc_quote_sessions` |
| Indexes | Expiry and account/expiry indexes |
| Dedicated Worker | `agfusion-quote-session-store` |
| Worker URL | `https://agfusion-quote-session-store.sayedhasan01740.workers.dev` |
| D1 binding | `DB` |
| Worker secret binding | `API_TOKEN` |
| Scheduled cleanup | `17 * * * *` (hourly) |

The dedicated Worker `workers.dev` endpoint is enabled. It requires a Bearer token and returns `401` for requests without valid authentication. Its separate Workers Preview URL remains disabled.

The main AGFusion application Worker `agfusion` still has its Production and Preview routes disabled. The Cloudflare feature-branch build/Preview pipeline completed successfully, but there is no public application Preview URL because Preview routing is disabled. Do not enable it without deciding how to protect the URL and which bindings/resources it may reach.

## Vercel Preview environment

The following variables are configured only for Preview deployments on branch `feature/arc-quote-session-d1-worker-20261109`:

| Variable | Type | Purpose |
|---|---|---|
| `AGFUSION_QUOTE_SESSION_STORE_URL` | Plain | HTTPS Worker origin |
| `AGFUSION_QUOTE_SESSION_STORE_TOKEN` | Sensitive | Must match Cloudflare `API_TOKEN` |
| `AGFUSION_QUOTE_SESSION_SECRET` | Sensitive | AES-256-GCM quote-session encryption secret |
| `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED` | Plain | Remains `false` |

The Vercel and Cloudflare secret values are write-only through the connected account APIs. Their presence and environment scope can be verified, but the values are not returned. Do not paste either value into chat, source control, a browser bundle, or build logs. If either side is rotated, set the exact same newly generated credential directly in both dashboards and redeploy the Preview branch.

Never set these secrets on Production until a separate security review and explicit release decision. Do not copy Production credentials into Preview.

## Worker API contract

Both endpoints require `Authorization: Bearer <API_TOKEN>` and JSON request bodies.

- `POST /v1/sessions/register`: validates the 64-character lowercase SHA-256 digest, normalized wallet, chain ID 5042, and expiry capped at 300 seconds; inserts one row; returns HTTP 201 on success.
- `POST /v1/sessions/consume`: performs one conditional SQL UPDATE requiring the digest, wallet, chain, unexpired row, and `consumed_at IS NULL`; returns HTTP 200 for the single successful consume and HTTP 409 for a replay or invalid binding.
- Requests larger than 4 KiB are rejected with HTTP 400 before complete body parsing.
- Missing or wrong Bearer authentication returns HTTP 401.
- Storage errors and D1 exceptions fail closed with HTTP 503.
- Unknown paths return HTTP 404 after authenticated request validation; unsupported HTTP methods return HTTP 405 after authentication.

The application client validates the Worker URL is HTTPS, applies a 5-second request timeout, and sends only the token digest and account binding to the Worker.

## Cloudflare Workers Build configuration

The feature branch uses the scoped OpenNext CLI command:

- Build command: `npx @opennextjs/cloudflare build`
- Preview deploy command: `npx wrangler preview`
- Production deploy command configured in Build settings: `npx @opennextjs/cloudflare deploy`

The previous unscoped command `npx opennextjs-cloudflare build` caused the earlier `could not determine executable to run` failure. The corrected feature-branch Preview build completed successfully, including OpenNext bundle generation and the `wrangler preview` step. No Production build or deployment was triggered.

The project uses Node.js 22 for the Cloudflare Workers Build environment, with `NPM_CONFIG_LEGACY_PEER_DEPS=true` to match the repository's lockfile install policy. The pinned packages are `@opennextjs/cloudflare@1.20.16` and `wrangler@4.158.0`.

## Run the authenticated HTTP verification script

A local HTTP harness is included at `scripts/test-arc-quote-session-worker-http.mjs`. It uses only synthetic SHA-256 digests and test wallet addresses. It does not sign, submit, or broadcast transactions.

1. Check out the feature branch and install dependencies only if needed:
   ```bash
   git checkout feature/arc-quote-session-d1-worker-20261109
   git pull origin feature/arc-quote-session-d1-worker-20261109
   ```
2. Confirm that Cloudflare `API_TOKEN` and the Vercel Preview variable `AGFUSION_QUOTE_SESSION_STORE_TOKEN` contain the same random 32-byte hex value. If the original value is no longer available, generate a new value locally with `openssl rand -hex 32`, then update both secret stores directly. Do not paste the value into chat or commit it.
3. Run the script from a local terminal. It prompts for the token without echoing it:
   ```bash
   export AGFUSION_QUOTE_SESSION_STORE_URL="https://agfusion-quote-session-store.sayedhasan01740.workers.dev"
   read -rsp "Worker API_TOKEN: " AGFUSION_QUOTE_SESSION_STORE_TOKEN
   echo
   export AGFUSION_QUOTE_SESSION_STORE_TOKEN
   node scripts/test-arc-quote-session-worker-http.mjs
   unset AGFUSION_QUOTE_SESSION_STORE_TOKEN
   ```
4. Save the pass/fail summary (not the secret) and attach it to PR #58. The script verifies authentication, validation, registration, exactly-one-winner concurrent consume, replay rejection, wallet binding, and body-size limits.

The script creates a small number of synthetic D1 rows with short expiries. The hourly cleanup job removes expired rows after the retention window. Do not use a real quote-session token or real customer wallet address.

## Validation evidence (updated 2026-11-10)

### Confirmed

- Cloudflare D1 schema and indexes are present.
- Previous direct D1 SQL checks confirmed exactly one of two concurrent conditional consume updates changed a row; the other changed zero rows.
- SQL checks for wrong wallet, wrong chain, and expired sessions returned zero changed rows.
- Synthetic rows from the SQL checks were deleted after the tests.
- The dedicated Worker's observability settings have invocation logs, persisted logs, and issue detection enabled. Traces are currently disabled.
- From an isolated Vercel Sandbox restricted to the Worker hostname, unauthenticated registration, a wrong Bearer token, and unauthenticated method probing each returned HTTP 401 with `{"error":"unauthorized"}`.
- The Vercel Preview deployment for commit `a6252017b3fe73f50a455971194b115001444394` is READY. Fetching its root page returned HTTP 200 and the AGFusion Next.js HTML.
- A recent Vercel Preview runtime-log query returned no error/warning records for its supported 30-minute window. This is not a full observability audit.

### Authenticated live HTTP verification (2026-11-10)

- A protected, temporary Vercel Preview-only smoke route sent authenticated requests to the deployed Cloudflare Worker using the Preview secret. The route was removed from the feature branch immediately after verification, and its one-time test credential was cleared.
- All 16 live checks passed: missing and incorrect Bearer credentials returned 401; an authenticated unsupported method returned 405; malformed digest, non-Arc chain, expired expiry, TTL over 300 seconds, and oversized body returned 400.
- Authenticated session registration returned HTTP 201.
- Two concurrent consume requests for the same synthetic session returned exactly one HTTP 200 and one HTTP 409. A subsequent replay returned HTTP 409.
- A wallet mismatch returned HTTP 409 without consuming the session; the correct wallet then consumed it with HTTP 200.
- The AGFusion application wrapper registered a session successfully through the same Worker and its concurrent consume test returned exactly one success and one rejection.
- All six rows created by the smoke test for the reserved synthetic wallet fixtures were deleted. A follow-up D1 query confirmed zero remaining rows for those fixtures.
- No wallet signing, transaction submission, or transaction broadcast was performed.

### Arc Testnet and isolated D1 failure verification (2026-11-10)

- The cleanup Preview for the prior D1 smoke route returned HTTP 200 at the app root. The temporary /api/internal/arc-testnet-appkit-smoke route was used only in Preview and deleted immediately after its successful check.
- Preview public configuration identified Arc Testnet, chain ID 5042002, and did not have a Circle Kit Key or Circle API key configured.
- Preview GET /api/rpc?chain=arc returned HTTP 200 with upstream https://rpc.testnet.arc.io, chain ID 0x4cef52, expected chain ID 0x4cef52.
- Direct read-only Arc Testnet RPC checks returned eth_chainId=0x4cef52 (decimal 5042002) and a valid eth_blockNumber=0x444436f. Only read methods were sent; no RPC write method was called.
- A keyless Circle App Kit estimateSwap call succeeded on Arc Testnet for the synthetic wallet 0x1111111111111111111111111111111111111111, pair USDC/EURC, amount 0.01 USDC. The response reported estimated output 0.01845 EURC, stop limit 0.018266 EURC, provider fee 0.000002 USDC, and estimated gas fee 0.02361295125 USDC. This is a quote estimate only, not a guaranteed settlement price.
- The Testnet App Kit estimate was performed without a Kit Key, wallet signing, approval, transaction preparation, transaction submission, or broadcast. The temporary Preview route was deleted after the test.
- After the keyless route change, a second protected-by-environment temporary Preview wrapper invoked the actual POST /api/circle/swap/prepare handler with the same synthetic Testnet request. It returned HTTP 200, chain ID 5042002, network testnet, and a USDC/EURC estimate (0.01842 EURC estimated output; 0.018236 EURC stop limit). The wrapper was deleted immediately afterward; the estimate-only route performs no wallet signing, approval, transaction submission, or broadcast.
- A keyless Testnet regression test was added to src/app/api/circle/swap/prepare/route.test.ts; the route now passes kitKey only when a server key is configured. Mainnet remains rejected by the existing hard gate, and the feature-branch Mainnet flag remains false.
- An isolated D1 database with no arc_quote_sessions table and a separate temporary Worker were created solely to exercise the storage-exception path. A syntactically valid registration reached the missing-table failure and returned HTTP 503 storage_unavailable, as intended. Both the temporary Worker and D1 database were deleted immediately after the test. The live agfusion-quote-sessions database was not changed.

Scope distinction: the D1 quote-session store and Uniswap quote-session module are intentionally pinned to Arc Mainnet chain ID 5042; they must not be represented as Testnet session storage. The successful Arc Testnet App Kit check validates the separate Circle estimate-only route. It does not validate Mainnet quote/session execution, and no Mainnet quote was requested.
### Remaining validation before any release

- A controlled D1 failure test in an isolated environment; do not simulate an outage by disabling or detaching the live database binding.
- Full Mainnet-specific quote-session application integration remains unverified. Keep its execution disabled; validate only with mocked upstreams or a separately approved isolated harness, and never use Production wallet credentials or broadcast a transaction.
- Independent cryptographic source/design review for the elliptic fork and a dedicated Arc Testnet smoke remain required. Passing this Worker HTTP verification does not replace those gates.

The authenticated live Worker HTTP verification is complete at 16/16 checks. The isolated D1 storage-failure check and the separate read-only / estimate-only Arc Testnet smoke checks also passed. These results do not validate Mainnet transaction execution or close the independent cryptographic security/release gates.

## Security and release gates

- `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
- No wallet signing, transaction broadcast, Mainnet transaction preparation, Production app deployment, or PR merge is authorized by this runbook.
- Elliptic fork provenance/source review and independent ECDSA approval remain tracked in [Issue #30](https://github.com/Sayed01740/agfusion/issues/30). A green npm audit is not independent cryptographic approval.
- Keep PR #58 Draft until authenticated live HTTP checks and the independent Mainnet security review are complete.
