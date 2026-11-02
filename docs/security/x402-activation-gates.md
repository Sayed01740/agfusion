# x402 activation gates

Status: **not approved for activation**. This checklist is a review artifact only.
The Agent Service route must remain disabled until every gate below is completed
and reviewed. Passing CI or applying the database schema does not authorize
payment processing.

## Current implementation evidence (2026-11-02)

- [x] Arc Testnet verifier source checks chain ID, successful receipt, transaction hash, USDC Transfer event, exact stored recipient/amount, and receipt-block consistency. The same-RPC block check is not independent consensus verification.
- [x] Settlement service compares the verified tuple and atomically consumes the challenge while recording the payment; unique transaction-hash protection is covered by disposable PostgreSQL integration tests.
- [x] Public GET remains disabled (402, no recipient/payment instructions); public POST remains fail-closed (503). Neither route calls the settlement service.
- [x] Earlier candidate `a07427bb0b6cdcd5c4e4620dd0acf6c0d0db2977`: GitHub CI and disposable PostgreSQL integration passed; its Preview GET smoke test returned the disabled 402 response.
- [x] Latest branch head `c89927c64d26ccdfc97cbdcb8d1d46462ff41de9` (2026-11-02): GitHub CI run `41446462963` passed typecheck, unit tests, and production build; disposable PostgreSQL integration run `41446462962` passed against its disposable CI database; matching Vercel Preview reached READY.
- [x] Repeated GET smoke test against the exact latest-head Preview (`https://agfusion-dhbdvbq16-sayeds-projects-e086c1e7.vercel.app/api/x402/agent-service`) returned HTTP 402, `paymentEnabled:false`, Arc Testnet chain ID 5042002, no recipient/payment instructions, and an explicit do-not-send-funds warning. Response included `Cache-Control: no-store` and `X-Payment-Enabled:false`.
- [ ] Structured audit events are only a first implementation slice. End-to-end correlation, complete early-return coverage, log retention/access, alerts, and operational ownership remain open.

These checks describe source/CI/Preview evidence only. They do not authorize database rollout,
configuration changes, Testnet payment tests, route integration, or activation.
The live POST route was not tested through the Preview fetch interface; automated
tests cover its fail-closed behavior.

## Operational decision pack

A companion proposal with DNS/ingress evidence requirements, rate-limit calibration,
cleanup controls, Arc finality options, audit/monitoring requirements, Testnet DB
rollout steps, independent-review checklist, and activation stop conditions is in
[`x402-operational-decision-pack.md`](./x402-operational-decision-pack.md).
It contains no assumed traffic thresholds and does not authorize activation.

## 1. Server-owned settlement configuration

- [ ] Introduce a server-only recipient setting (for example,
  `AGFUSION_X402_RECIPIENT`). Do not use a `NEXT_PUBLIC_*` variable as the
  authority for a future payment destination.
- [ ] Remove the implicit hard-coded recipient fallback before enabling
  challenge creation. Missing or malformed configuration must fail closed.
- [ ] Validate the address at process startup or at challenge creation, then
  normalize it consistently for storage and comparison.
- [ ] Confirm the destination is controlled by the intended service operator
  and independently verify it on Arc Testnet.
- [ ] Keep Arc Mainnet configuration and payment support out of this change.

## 2. Database readiness

- [ ] Review the SQL in `x402-postgres-schema-rollout.md` against the exact
  target database schema and current Prisma models.
- [ ] Take and verify a restorable backup before any persistent schema change.
- [ ] Obtain explicit owner approval and have an authorized operator apply the
  reviewed SQL to the intended **Testnet** application database.
- [ ] Verify all three tables, all columns, nullability, timestamp precision,
  and unique/non-unique indexes after rollout.
- [ ] Run a read/write smoke test against that database without sending a
  blockchain transaction.
- [ ] Confirm the application runtime database role has only the permissions
  needed for challenge and payment records.
- [ ] Never use `prisma db push` against a production or shared database as a
  shortcut. CI's disposable PostgreSQL database is not the application DB.

## 3. Challenge endpoint

- [ ] Add a dedicated challenge-creation operation only after the server-only
  recipient and database gates pass.
- [ ] Keep challenge issuance behind a server-only feature flag that defaults
  to disabled. Missing, malformed, or false configuration must not issue a
  challenge or reveal a payment destination.
- [ ] Generate a cryptographically random nonce server-side and persist the
  complete authoritative tuple: service ID, chain ID, token, recipient,
  amount, and expiry.
- [ ] Enforce a short expiry and reject expired, unknown, mismatched, or already
  consumed challenges.
- [ ] Apply rate limits and abuse controls to challenge creation and settlement.
- [ ] Return no payment instructions when configuration or database readiness
  checks fail.

## 4. Trusted client identity and settlement request boundary

- [ ] Confirm the actual ingress topology for every deployed hostname before
  selecting a client-IP source: direct Vercel ingress, Cloudflare proxy in
  front of Vercel, or another proxy chain.
- [x] Inventory the Vercel project domain attachment and branch-scoped Preview
  environment metadata (checked 2026-11-02): only `agfusion.vercel.app` is
  attached as a verified project domain; no custom domain is attached; the
  current PR Preview is served on a Vercel deployment hostname; and no
  branch-scoped Preview environment variables are configured.
- [ ] Treat that inventory as a point-in-time platform configuration snapshot,
  not proof of the full public DNS/proxy path or runtime header behavior.
  Recheck it if a custom domain, Cloudflare proxy, or another ingress layer is
  introduced.
- [ ] For direct Vercel ingress only, the current Vercel request-header
  documentation says Vercel overwrites `x-forwarded-for` to prevent IP
  spoofing, and `x-vercel-forwarded-for` / `x-real-ip` are equivalent
  platform values. Validate this behavior in the actual deployment before use.
- [ ] If Cloudflare or another proxy sits in front of Vercel, do not assume
  Vercel preserves the original client IP. Vercel documents that external
  proxy IP forwarding requires its Enterprise Trusted Proxy feature. Do not
  trust a caller-supplied forwarding header as a workaround.
- [ ] Never use a caller-controlled body field or arbitrary
  `x-forwarded-for`, `x-real-ip`, or custom header as the rate-limit identity
  without a platform guarantee that the value is sanitized and overwritten
  at the trusted edge.
- [ ] If the platform cannot provide a trustworthy identity, keep the
  challenge/settlement routes disabled rather than silently falling back to a
  spoofable value.
- [ ] Define a strict JSON object schema for the settlement request. Accept only
  challenge ID, nonce, and transaction hash; reject unknown fields.
- [ ] Apply a streaming request-body size limit before parsing JSON. Do not
  trust `Content-Length` alone.
- [ ] Validate transaction-hash syntax before any RPC work.
- [ ] Treat all client-provided payment headers and browser/session policy
  values as untrusted hints, never as proof.
- [ ] Keep the existing fail-closed POST response until the full path is
  implemented, tested, and reviewed.

## 5. On-chain verification and replay controls

- [x] Source implementation verifies Arc Testnet chain ID, successful receipt,
  receipt transaction hash, configured USDC contract, standard Transfer event,
  exact stored recipient, and exact stored amount in base units. Operational
  activation remains blocked by the trust-model and configuration gates below.
- [ ] Reject mint/burn-shaped transfers, malformed topics/data, removed logs,
  ambiguous matching transfers, and mismatched block/receipt data.
- [ ] Document the RPC trust boundary. A receipt plus block-hash consistency
  check is not an independently verified consensus certificate.
- [ ] Decide whether the service will rely on the documented Arc deterministic
  finality guarantee or operate an independently verified Arc node. Record
  the chosen trust model and operational monitoring before activation.
- [x] Source implementation atomically consumes the persisted challenge and
  inserts the payment record in one database transaction. The unique
  transaction-hash constraint prevents replay across challenges; disposable
  PostgreSQL integration tests pass.
- [ ] Ensure database failure, RPC failure, timeout, duplicate payment, or
  transaction rollback can never unlock the paid feed.

## 6. Operational and security review

- [ ] Complete structured audit coverage, end-to-end correlation, log
  retention/access policy, alert routing, thresholds, dashboards, and
  operational ownership. The first redacted audit-event implementation slice
  is present but is not a complete monitoring system.
- [ ] Define RPC timeout/retry limits and alerting for sustained RPC/database
  failures.
- [ ] Review denial-of-service exposure and resource use for receipt lookups.
- [ ] Review the final diff and tests with a second reviewer.
- [x] Run GitHub CI and disposable PostgreSQL integration on latest head
  `c89927c64d26ccdfc97cbdcb8d1d46462ff41de9`.
- [ ] Perform a Testnet-only end-to-end test using a deliberately small test
  payment, after explicit approval. Verify the receipt, stored payment,
  single-use challenge, replay rejection, and feed authorization.
- [x] Automated tests cover fail-closed behavior for database/RPC failures;
  public GET/POST routes remain disabled. Live POST smoke test is not performed.
- [ ] Only after all gates are checked and separately approved may a follow-up
  change wire settlement into the HTTP route.

## 7. Explicit non-goals for this PR

- No live payment or transaction signing/broadcasting.
- No production database schema changes.
- No Mainnet configuration, contract, or payment support.
- No enabling of the paid agent feed.
- No removal of the current disabled GET/POST behavior.

**Current decision:** keep payment processing disabled. This checklist does not
grant approval to apply SQL, change environment variables, send funds, or
activate the endpoint.


## Latest-head verification (2026-11-02)

The current branch head `c89927c64d26ccdfc97cbdcb8d1d46462ff41de9` passed:
- GitHub CI run `41446462963`: dependency install, TypeScript typecheck, unit tests, and production build.
- Disposable PostgreSQL integration run `41446462962`: schema push and integration tests against the workflow's disposable PostgreSQL service only.
- Matching Vercel Preview deployment reached READY.

A repeated GET request to `/api/x402/agent-service` on that exact Preview returned HTTP 402, `paymentEnabled:false`, Arc Testnet chain ID `5042002`, no recipient/payment instructions, and the do-not-send-funds warning. `Cache-Control:no-store` and `X-Payment-Enabled:false` were present.

This is GET-only Preview evidence. No live POST test, application database access or mutation, Testnet payment, secret/environment change, route activation, merge, Production deployment, or Mainnet change was performed. PR #39 remains Draft and unmerged; no independent review was present at the latest review check.
