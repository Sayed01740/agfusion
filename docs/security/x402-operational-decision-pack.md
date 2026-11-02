# x402 operational decision pack

Status: **proposal for owner and independent-reviewer decision; not an activation approval**.
Prepared 2026-11-02 for PR #39. The public Agent Service GET/POST routes must remain
disabled while any required decision or verification is open.

This document intentionally separates facts observed in the repository/platform
from decisions that require the service owner, hosting operator, database owner,
or independent reviewer. No traffic baseline, DNS authority, database backup,
or chain-operator evidence is assumed.

## 1. Ingress and trusted client identity

### Evidence currently available

- The Vercel project inventory previously showed `agfusion.vercel.app` as
  the attached verified project domain, no custom domain attached, and the
  candidate Preview served on a Vercel deployment hostname.
- That inventory does not prove authoritative DNS records, Cloudflare proxy
  status, nameserver delegation, redirects, upstream proxies, or runtime
  request-header behavior.
- The current rate limiter accepts an identity supplied by its caller. It does
  not authenticate or derive the identity.

### Required verification procedure

1. The domain owner exports the authoritative DNS records and nameserver
   delegation for every production and preview hostname used by the app.
2. Record each CNAME/A/AAAA target, proxy mode, redirect, worker/load-balancer
   hop, and final Vercel project mapping. Store screenshots/export with a
   timestamp and redact unrelated records.
3. From an authorized test client, send unique random diagnostic header values
   to a non-payment diagnostic endpoint. At the trusted edge, log only whether
   each candidate header was overwritten/present and a one-way test digest,
   never a real client IP or authorization header.
4. Compare direct Vercel ingress with any proxied route. Do not assume
   `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`, or
   `x-vercel-forwarded-for` is trustworthy without proving which hop sets it.
5. Have the hosting operator document the selected platform guarantee and
   have a second reviewer verify it against current Vercel/Cloudflare settings.
6. If a trustworthy server-side identity cannot be established, do not wire
   the rate limiter into the payment route. Keep the route disabled.

### Decision record

- Authoritative production hostname(s): **owner to supply**
- DNS/proxy topology and evidence timestamp: **operator to supply**
- Selected trusted identity source and guarantee: **operator + reviewer to approve**
- Fallback if unavailable: **fail closed; no caller-controlled header fallback**

## 2. Rate-limit policy proposal

Do not select numeric production thresholds from guesswork. There is no
verified traffic baseline or abuse profile in this repository.

### Separate buckets

- Challenge issuance: per trusted identity and per service.
- Settlement verification: per trusted identity and per service, with a
  stricter RPC-work budget.
- Service-wide backstop: protects database and RPC capacity even when many
  identities are distributed.
- Optional short burst bucket: only after measured legitimate burst patterns
  are known.

### Calibration and acceptance method

1. Collect a privacy-preserving baseline from non-payment traffic or a
   controlled load test: requests per minute, burst size, concurrent requests,
   p50/p95/p99 handler latency, DB pool saturation, RPC request rate, and
   legitimate retry patterns.
2. Run load tests against disposable infrastructure only. Include distributed
   identities, repeated challenge creation, repeated tx hashes, slow bodies,
   timeouts, malformed RPC responses, and database unavailability.
3. Set per-client and global thresholds below the measured safe capacity,
   retaining an explicit capacity reserve agreed by the operator.
4. Define the response contract: HTTP 429 for an exhausted client bucket,
   HTTP 503 for unavailable shared limiter/dependency, stable machine-readable
   reason code, and a bounded `Retry-After` where it can be calculated safely.
   Never turn a rate-limit failure into authorization.
5. Document window algorithm, clock source, bucket expiry, concurrency
   semantics, multi-region behavior, and how threshold changes are reviewed.
6. Review thresholds after observing controlled Testnet traffic, before any
   paid route activation. Store chosen values in a reviewed server-side
   configuration, not client input.

### Cleanup policy

- Keep the existing bounded cleanup helper operator-controlled until the
  database owner approves automation.
- Before scheduling: define maximum rows per batch, execution frequency,
  lock/statement timeout, least-privilege DB role, dry-run query, monitoring,
  alert on backlog/error, and a stop/rollback procedure.
- Verify cleanup against disposable PostgreSQL data first. Confirm it only
  removes expired limiter buckets and never challenges/payment records.
- No scheduled DB-mutating job is authorized by this document.

Decision owner: **service owner + database operator + independent reviewer**.
Numeric thresholds, cadence, and cleanup batch size remain **TBD after evidence**.

## 3. Arc finality and RPC trust decision

The current verifier compares the receipt block hash with the block returned
for that height by the same RPC. This is a consistency check, not independent
consensus verification.

### Option A: trusted Arc RPC reports protocol finality

- Trust boundary: selected RPC provider and its reporting of Arc's deterministic
  finality guarantee.
- Required controls: provider identity/availability monitoring, TLS and fixed
  endpoint policy, bounded request/response limits, incident response for
  inconsistent receipt/block responses, and documented provider outage behavior.
- Limitation: the application does not independently verify validator
  signatures or a consensus certificate.

### Option B: independently operated/verified Arc node

- Trust boundary: node software, operator, validator/consensus data sources,
  and node maintenance process.
- Required controls: node provenance/version, synchronization and health
  monitoring, independent verification method, failover policy, key/infra
  security, and a documented disagreement process.
- Limitation: materially greater operational burden; do not claim independent
  verification unless the node actually verifies the required consensus data.

### Decision required

The service owner and reviewer must choose A or B, name the source of truth,
define what happens when RPC providers disagree or are unavailable, and record
the operational owner. Do not invent a confirmation-depth rule or silently
treat a same-RPC block lookup as independent finality proof.

## 4. Audit and operational monitoring

The current branch contains a first slice of redacted structured audit events.
It is not a complete observability system.

Before activation, define and test:

- End-to-end correlation ID propagation from challenge request through
  verification, replay check, payment record, and feed authorization.
- Coverage for every success, rejection, invalid/expired challenge,
  configuration failure, rate-limit failure, RPC timeout/error, DB error,
  duplicate transaction, and rollback path.
- Allow-listed fields only: component, event, stable reason code,
  correlation ID, timestamp, and non-sensitive service identifier.
- Explicit prohibition on logging secrets, authorization headers, request
  bodies, nonce values, raw transaction payloads, and raw ORM/provider errors.
- Log access roles, retention period, deletion policy, export controls, and
  incident evidence preservation.
- Alert ownership, on-call/escalation route, thresholds, dashboards, and
  runbooks for sustained RPC/DB failures, unusual rejection spikes, duplicate
  transaction attempts, limiter backlog, and audit pipeline failure.
- Tests that assert sensitive values are absent from emitted records.

Owner and reviewer must approve retention, access, alert thresholds, and
operational ownership. Do not represent JSON console events as alerting until
the deployment log pipeline is verified.

## 5. Testnet application database rollout plan

No shared/application database rollout is authorized or evidenced here.
Disposable CI PostgreSQL success is not application DB readiness.

1. Database owner identifies the exact Testnet application DB and runtime
   role. Confirm it is not Production or shared with unrelated workloads.
2. Review `docs/security/x402-postgres-schema-rollout.md` against the current
   Prisma models and target schema; obtain independent SQL review.
3. Take a database-provider backup and perform a restore rehearsal into an
   isolated database. Record backup ID/time, restore result, schema version,
   and operator.
4. Agree a maintenance window, rollback plan, expected locks/downtime, and
   exact SQL checksum. No `prisma db push` shortcut.
5. After explicit written owner approval, an authorized DB operator applies
   the reviewed SQL manually to the Testnet DB.
6. Verify all three tables, columns, types, nullability, timestamp precision,
   unique/non-unique indexes, and runtime-role permissions.
7. Run a read/write smoke test using disposable synthetic rows and remove only
   those test rows. Do not send a blockchain transaction.
8. Record evidence and have a second reviewer reconcile the result with the
   migration SQL. If any check differs, stop and use the approved rollback.

No backup, restore rehearsal, schema apply, or application DB read/write test
has been performed by this work.

## 6. Independent review package

Reviewer should inspect the full stacked diff (PR #39 and base PR #36), not
only the latest documentation commits. Review focus:

- Route remains disabled; no header/body can authorize payment.
- Challenge tuple is server-owned, expires, and is single-use.
- Receipt parser rejects malformed, removed, mint/burn, ambiguous, and
  mismatched Transfer logs.
- Chain ID, token, recipient, amount, and transaction hash are exact.
- RPC bounds, timeout, failure behavior, and finality trust boundary are
  explicit.
- DB transaction and unique tx hash enforce replay protection under
  concurrency.
- Rate-limit identity cannot be caller-controlled; DB/secret failure closes.
- Audit logs are redacted and do not claim complete operational monitoring.
- SQL rollout is compatible with actual schema and has a tested rollback.
- Tests cover negative paths and no accidental route activation.

Current PR state at preparation: Draft, open, unmerged; no submitted reviews
or inline review threads were returned by GitHub at the latest check. A named
reviewer and review outcome remain outstanding.

## 7. Activation sequence and stop conditions

Activation is a separate future change and requires all of the following:
1. Owner-approved DNS/ingress identity evidence.
2. Approved rate-limit policy and cleanup operations.
3. Recorded Arc finality trust decision.
4. Complete audit coverage and operational monitoring.
5. Owner-approved Testnet DB rollout with restore evidence and post-checks.
6. Independent review approval of the full stacked diff.
7. Separate explicit approval for Testnet payment end-to-end testing.
8. Successful Testnet-only end-to-end test and replay/authorization checks.
9. A separate activation PR with fresh CI, Preview review, and explicit owner
   approval.

Stop and keep payment disabled on any ambiguity, dependency outage, RPC
disagreement, missing identity, missing secret, DB failure, replay, invalid
challenge, or audit/monitoring failure.

## Explicit exclusions

This proposal does not authorize merge, Production deployment, payment
activation, transaction signing/broadcasting, Testnet funds movement, shared
database mutation, secret/environment changes, or any Arc Mainnet change.
