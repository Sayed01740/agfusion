> **Exact PR #51 Preview smoke-test evidence (2026-11-04):** The Preview deployment
> for commit `891721e063ab1c951a3058bc2a1d6058cd7fadfa` reached READY. Read-only
> requests through the authenticated Vercel Preview fetch path returned:
> - `GET /`: HTTP 200.
> - `GET /api/rpc?chain=arc`: HTTP 200; upstream
>   `https://rpc.testnet.arc.io`; returned chain ID and expected chain ID both
>   `0x4cef52` (Arc Testnet 5042002); `Cache-Control: no-store`.
> - `GET /api/x402/agent-service`: HTTP 503 with
>   `code: X402_DISABLED`; `Cache-Control: no-store`; no payment instructions.
>
> These are read-only GET checks only. No POST settlement request, live Circle
> quote, Mainnet request, wallet signature, transaction broadcast, or payment
> was performed. Vercel runtime-log queries for this deployment over the
> 30-minute smoke-test window returned no records, including no warning/error
> records. An empty log query is not proof that no errors occurred.
>
> **Current-head clarification (2026-11-04):** This checklist contains historical
> evidence below and must not be read as a statement of current Preview behavior.
> On PR #50 head `df14fc75d08636d39291fdfe3816e31c291e1aa8`, the current source
> for the Agent Service GET and POST routes returns `503 X402_DISABLED` with
> `Cache-Control: no-store`. The earlier HTTP 402 Preview observation below
> belongs to the 2026-11-02 deployment only and is not current-head evidence.
> A read-only HTTP smoke test against the exact PR #50 Preview has not yet been
> completed, so the current Preview response is not independently confirmed.
>
> PR #50 exact-SHA verification: CI run `41810740252` (run #965), dependency
> audit `41810741017` (#227), and disposable PostgreSQL integration
> `41810741410` (#73) all completed successfully. The matching Vercel Preview
> deployment reached READY. No independent PR review has been submitted.
>
> **Separate Arc chain-scope finding:** `/api/circle/swap/prepare` currently
> accepts both Arc Testnet chain ID `5042002` and Arc Mainnet chain ID `5042`
> and returns unsigned transaction-preparation data. This is not transaction
> signing or broadcast, but it means the API is not Testnet-only. Keep Mainnet
> use out of any Testnet-only release decision until the owner explicitly
> decides whether to retain or server-side gate that preparation capability.
> Do not infer safety from UI defaults or public environment variables.
>
> **Credential hardening in progress:** the server Kit-key resolver previously
> accepted `NEXT_PUBLIC_KIT_KEY` as a fallback despite the repository's
> server-only credential policy. A separate Draft PR is adding a server-only
> import, removing that fallback, and adding regression tests. Do not remove or
> rotate any Vercel environment entry as part of this code-only change.

# x402 activation gates

Status: **not approved for activation**. This checklist is a review artifact only.
The Agent Service route must remain disabled until every gate below is completed
and reviewed. Passing CI or applying the database schema does not authorize
payment processing.

## Historical implementation evidence (2026-11-02)

- [x] Arc Testnet verifier source checks chain ID, successful receipt, transaction hash, USDC Transfer event, exact stored recipient/amount, and receipt-block consistency. The same-RPC block check is not independent consensus verification.
- [x] Settlement service compares the verified tuple and atomically consumes the challenge while recording the payment; unique transaction-hash protection is covered by disposable PostgreSQL integration tests.
- [x] Public GET remains disabled (402, no recipient/payment instructions); public POST remains fail-closed (503). Neither route calls the settlement service.
- [x] Earlier candidate `a07427bb0b6cdcd5c4e4620dd0acf6c0d0db2977`: GitHub CI and disposable PostgreSQL integration passed; its Preview GET smoke test returned the disabled 402 response.
- [x] Current branch head `f60d2ebf1667288fbd1aa3156bca72bd1854eaaf` (2026-11-02): GitHub CI run `41447704265` passed typecheck, unit tests, and production build; disposable PostgreSQL integration run `41447704261` passed against its disposable CI database; matching Vercel Preview deployment `dpl_YmE9QUUSwUgn66VwXjSroKguKKSf` reached READY.
- [x] GET smoke test against the exact current-head Preview (`https://agfusion-axqxaiylt-sayeds-projects-e086c1e7.vercel.app/api/x402/agent-service`) returned HTTP 402, `paymentEnabled:false`, Arc Testnet chain ID 5042002, no recipient/payment instructions, and an explicit do-not-send-funds warning. Response included `Cache-Control: no-store` and `X-Payment-Enabled:false`.
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
- [x] Reject zero-address mint-shaped transfers, removed logs, malformed Transfer
  topic counts and non-canonical indexed-address padding, duplicate matching
  transfers, and mismatched receipt/block hashes. Source and regression tests
  cover these cases on the current verifier branch.
- [ ] Add explicit regression tests for burn-to-zero transfers and malformed
  Transfer data encodings/lengths. The verifier rejects data that is not one
  32-byte hex word, but this specific malformed-data branch lacks a direct test.
- [x] Document the RPC trust boundary: a receipt plus same-provider block-hash
  consistency check is not an independently verified consensus certificate
  (see `x402-arc-finality-and-rpc-trust.md`).
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
- [x] Run GitHub CI and disposable PostgreSQL integration on current head
  `f60d2ebf1667288fbd1aa3156bca72bd1854eaaf` (CI `41447704265`, disposable
  PostgreSQL `41447704261`).
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


## Current PR #51 verification (2026-11-04)

Exact PR head: `eaef87e55290bef453cf10fc5240157eddb2bd10`.

- [x] CI #967 passed on the exact documentation-updated head, including typecheck,
  unit tests, and production build.
- [x] Dependency audit #229 passed on the exact documentation-updated head.
- [x] CI #966, dependency audit #228, and disposable PostgreSQL integration #74
  passed on the underlying code commit `891721e063ab1c951a3058bc2a1d6058cd7fadfa`.
  The later `eaef87e` commit changes documentation only.
- [x] Matching Vercel Preview deployment reached READY.
- [x] Read-only Preview GET checks: homepage 200; Arc Testnet RPC 200 with chain
  ID `0x4cef52` (5042002); Agent Service and Risk Oracle both return
  `503 X402_DISABLED` with `Cache-Control: no-store`.
- [ ] Live POST settlement smoke test, Circle quote preparation, application
  database rollout, Testnet payment, and paid-feed authorization remain
  unperformed and unauthorized.
- [ ] Independent source/security review remains outstanding. No independent
  review submission is recorded on PR #51.

This evidence does not authorize route activation, database mutation, payment,
Mainnet use, wallet signing/broadcast, merge, or Production promotion. Keep
both x402 routes fail-closed until every operational and independent-review
gate is explicitly completed and approved.
