# x402 pre-activation security review

Status: **review only; payment processing must remain disabled**.

This review records the remaining operational and trust boundaries after the
fail-closed route, verifier, challenge store, settlement service, and shared
rate limiter were added. It does not authorize schema rollout, environment
changes, deployment, payment testing, or activation.

## Confirmed safe boundaries in the current branch

- The Agent Service GET response advertises that payments are disabled and
  explicitly says not to send funds. It does not publish a recipient.
- The POST handler ignores all request credentials and returns HTTP 503 with
  `X-Payment-Status: Unavailable`. It does not unlock the feed.
- The verifier is fixed to Arc Testnet chain ID 5042002 and the configured
  USDC contract/amount constants in source. It validates the receipt,
  Transfer event, recipient, amount, and receipt-block consistency.
- Challenge consumption and payment insertion are designed as one database
  transaction, with unique transaction-hash replay protection.
- The PostgreSQL integration workflow uses a disposable CI database. No
  application database schema has been changed.
- The settlement service, challenge helpers, and rate limiter are not wired
  into the public HTTP route.

## Remaining findings and required controls

### 1. Ingress identity is unresolved

The rate limiter accepts an identity supplied by its caller. It does not
derive or authenticate that identity itself. Do not pass arbitrary request
headers or body fields to it.

Before wiring it into a route, document the ingress path for every hostname
and verify the platform's actual behavior. If Cloudflare is proxying traffic
to Vercel, do not assume the original client IP is trustworthy at the Vercel
function. A caller-controlled `CF-Connecting-IP`, `X-Forwarded-For`, or
custom header is not sufficient proof of identity. If a trusted identity
cannot be established, leave the route disabled.

### 2. RPC availability and resource bounds

**Implementation complete on the current branch; operational monitoring remains open.**

The verifier now:
- Uses one shared 10-second AbortSignal.timeout deadline across its three
  sequential JSON-RPC calls, rather than allowing each call an independent
  timeout.
- Rejects RPC JSON response bodies larger than 256 KiB. It checks
  Content-Length when present and also enforces the cap while streaming.
- Rejects receipts containing more than 256 logs before Transfer-event
  matching.
- Performs no automatic retry. RPC errors, timeout, malformed JSON, and
  resource-limit failures return a closed verification result.

Regression tests cover oversized RPC responses and excessive receipt logs.
The settlement integration test uses real Response objects so it exercises
the bounded response reader rather than a partial mock.

These limits bound the verifier's work but do not remove the RPC provider as a
trust boundary. Before activation, retain monitoring and alerting for RPC
timeouts, failures, and unusual rejection rates. Keep the RPC URL fixed to the
intended Arc Testnet endpoint unless a separately reviewed configuration
design is approved.

### 3. Finality remains a documented trust decision, not a code-level proof

The verifier checks that the receipt block hash matches the block returned
for that height by the same RPC. This is a canonicality consistency check,
not independent verification of validator signatures or a consensus
certificate.

Arc documentation describes deterministic finality. Before activation, the
operator and reviewer must explicitly decide whether the service relies on
that protocol guarantee as reported by the selected RPC, or operates an
independently verified Arc node. Record the chosen source of truth, monitoring,
and response to RPC disagreement. Do not invent a confirmation-depth rule.

### 4. Audit events and operational monitoring are not complete

Before activation, add structured, privacy-conscious events for challenge
creation, verification success/failure, replay rejection, rate limiting, and
database/RPC unavailability. Log stable reason codes and correlation IDs only.
Never log secrets, raw authorization headers, nonces, or full request bodies.
Avoid serializing raw provider/ORM errors into public responses or broadly
accessible logs.

Define alerts and operational ownership for sustained RPC failures, database
failures, unusual rejection spikes, and rate-limit table growth. The bounded
cleanup helper currently has no scheduled maintenance caller; define and test
an operator-controlled cleanup schedule before relying on it.

### 5. Rate-limit policy and deployment configuration remain pending

The shared PostgreSQL limiter fails closed when its server-only HMAC secret or
database is unavailable. The secret must be at least 32 characters, stable
across instances sharing the database, and never exposed to the browser.
No deployment secret has been configured by this work.

Before route integration, specify separate limits for challenge issuance and
settlement, window lengths, retry behavior, and any service-wide backstop.
Confirm the trusted identity source first. Do not silently use a shared
fallback identity that would either disable legitimate traffic or collapse
all clients into one bucket.

### 6. Database rollout remains an owner-controlled operation

The three-table SQL remains a manual review artifact. It has not been applied
to any shared or production database. The repository has no established
Prisma migration history. Any rollout requires a reviewed target schema,
verified restorable backup, explicit owner approval, authorized Testnet DB
operator, post-apply schema checks, and a read/write smoke test that sends no
blockchain transaction.

## Required exit criteria

- [ ] Confirm the actual Cloudflare DNS proxy state and complete ingress path.
- [ ] Select and test a trustworthy server-side client identity source.
- [x] Add bounded RPC timeout/deadline and response/resource limits (10-second shared deadline, 256 KiB response cap, 256 receipt-log cap, no automatic retries; regression tests added).
- [ ] Record the Arc finality trust decision and operational response plan.
- [ ] Add redacted structured audit events and monitoring ownership.
- [ ] Define rate-limit policy and operator-controlled bucket cleanup.
- [ ] Complete owner-approved Testnet-only database rollout and smoke test.
- [ ] Review the complete HTTP integration diff with a second reviewer.
- [ ] Run all CI checks on the exact candidate commit.
- [ ] Obtain separate explicit approval before any Testnet payment E2E or
  activation work.

Until every applicable exit criterion is satisfied and separately approved,
keep GET disabled and POST fail-closed. Mainnet support is out of scope.
