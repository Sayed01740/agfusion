# x402 activation gates

Status: **not approved for activation**. This checklist is a review artifact only.
The Agent Service route must remain disabled until every gate below is completed
and reviewed. Passing CI or applying the database schema does not authorize
payment processing.

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
- [ ] Verify both tables, all columns, nullability, timestamp precision, and
  unique/non-unique indexes after rollout.
- [ ] Run a read/write smoke test against that database without sending a
  blockchain transaction.
- [ ] Confirm the application runtime database role has only the permissions
  needed for challenge and payment records.
- [ ] Never use `prisma db push` against a production or shared database as a
  shortcut. CI's disposable PostgreSQL database is not the application DB.

## 3. Challenge endpoint

- [ ] Add a dedicated challenge-creation operation only after the server-only
  recipient and database gates pass.
- [ ] Generate a cryptographically random nonce server-side and persist the
  complete authoritative tuple: service ID, chain ID, token, recipient,
  amount, and expiry.
- [ ] Enforce a short expiry and reject expired, unknown, mismatched, or already
  consumed challenges.
- [ ] Apply rate limits and abuse controls to challenge creation and settlement.
- [ ] Return no payment instructions when configuration or database readiness
  checks fail.

## 4. Settlement request boundary

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

- [ ] Verify Arc Testnet chain ID, successful receipt, receipt transaction hash,
  configured USDC contract, standard Transfer event, exact stored recipient,
  and exact stored amount in base units.
- [ ] Reject mint/burn-shaped transfers, malformed topics/data, removed logs,
  ambiguous matching transfers, and mismatched block/receipt data.
- [ ] Document the RPC trust boundary. A receipt plus block-hash consistency
  check is not an independently verified consensus certificate.
- [ ] Decide whether the service will rely on the documented Arc deterministic
  finality guarantee or operate an independently verified Arc node. Record
  the chosen trust model and operational monitoring before activation.
- [ ] Atomically consume the persisted challenge and insert the payment record
  in one database transaction. The unique transaction-hash constraint must
  prevent replay across challenges.
- [ ] Ensure database failure, RPC failure, timeout, duplicate payment, or
  transaction rollback can never unlock the paid feed.

## 6. Operational and security review

- [ ] Add structured, privacy-conscious audit events for challenge creation,
  verification outcome, replay rejection, and database failure. Never log
  secrets or credentials.
- [ ] Define RPC timeout/retry limits and alerting for sustained RPC/database
  failures.
- [ ] Review denial-of-service exposure and resource use for receipt lookups.
- [ ] Review the final diff and tests with a second reviewer.
- [ ] Run unit tests, disposable PostgreSQL integration tests, typecheck, and
  production build on the exact candidate commit.
- [ ] Perform a Testnet-only end-to-end test using a deliberately small test
  payment, after explicit approval. Verify the receipt, stored payment,
  single-use challenge, replay rejection, and feed authorization.
- [ ] Confirm the endpoint still fails closed when the database or RPC is
  unavailable.
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
