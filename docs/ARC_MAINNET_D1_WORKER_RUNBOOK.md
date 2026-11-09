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

## Validation evidence (2026-11-09)

### Confirmed

- Cloudflare D1 schema and indexes are present.
- Previous direct D1 SQL checks confirmed exactly one of two concurrent conditional consume updates changed a row; the other changed zero rows.
- SQL checks for wrong wallet, wrong chain, and expired sessions returned zero changed rows.
- Synthetic rows from the SQL checks were deleted after the tests.
- The dedicated Worker's observability settings have invocation logs, persisted logs, and issue detection enabled. Traces are currently disabled.
- From an isolated Vercel Sandbox restricted to the Worker hostname, unauthenticated registration, a wrong Bearer token, and unauthenticated method probing each returned HTTP 401 with `{"error":"unauthorized"}`.
- The Vercel Preview deployment for commit `a6252017b3fe73f50a455971194b115001444394` is READY. Fetching its root page returned HTTP 200 and the AGFusion Next.js HTML.
- A recent Vercel Preview runtime-log query returned no error/warning records for its supported 30-minute window. This is not a full observability audit.

### Still required before closing the HTTP release gate

- Authenticated registration through the deployed Worker, expecting HTTP 201.
- Two concurrent authenticated consume requests for one synthetic session, expecting exactly one HTTP 200 and one HTTP 409.
- Replay, wrong wallet, wrong chain, expired session, invalid expiry, malformed digest, and oversized request behavior through the live HTTP endpoint.
- A controlled D1 failure test in an isolated environment; do not simulate an outage by disabling or detaching the live database binding.
- Next.js quote-session integration using dedicated test-only credentials and a Testnet-safe wallet/session. Do not use Production wallet credentials or broadcast a transaction.

The live HTTP authentication boundary is partially verified, but the authenticated end-to-end checks remain open because the secret values cannot be read back from Cloudflare or Vercel. Keep this distinction explicit.

## Security and release gates

- `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`.
- No wallet signing, transaction broadcast, Mainnet transaction preparation, Production app deployment, or PR merge is authorized by this runbook.
- Elliptic fork provenance/source review and independent ECDSA approval remain tracked in [Issue #30](https://github.com/Sayed01740/agfusion/issues/30). A green npm audit is not independent cryptographic approval.
- Keep PR #58 Draft until authenticated live HTTP checks and the independent Mainnet security review are complete.
