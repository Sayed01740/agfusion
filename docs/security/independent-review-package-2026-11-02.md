# AGFusion independent security review package

**Prepared:** 2026-11-02  
**Repository:** `Sayed01740/agfusion`  
**Purpose:** Give an independent reviewer a reproducible, bounded review plan for the security PR stack.  
**Status:** Review preparation only. This document is not an audit, approval, or release authorization.

## 1. Review scope and current PR chain

Review the stack in dependency order:

| Order | PR | Exact head | Primary scope |
|---:|---:|---|---|
| 1 | [#32](https://github.com/Sayed01740/agfusion/pull/32) | `6b225ef51b55ccf4b25c4b0e69edbbdf72b98cb7` | Shared streaming JSON body cap and schema validation |
| 2 | [#34](https://github.com/Sayed01740/agfusion/pull/34) | `de29ccd585429b547a9802b7f2ed01084e1dd644` | Circle auth and SIWE request-body limits |
| 3 | [#35](https://github.com/Sayed01740/agfusion/pull/35) | `3d7080f03119463711597ec8b6a8b79cbc01dfa8` | Circle PW, swap preparation, transaction and risk-oracle body limits |
| 4 | [#41](https://github.com/Sayed01740/agfusion/pull/41) | `1dca9263f2901f0aa5c61a7c4330f2bbeb932c53` | Reconciled proxy / JSON-RPC / diagnostics body limits; replaces superseded PR #36 |
| 5 | [#39](https://github.com/Sayed01740/agfusion/pull/39) | `b54b3a3cc7b5c57804fafa9b3137ad899084e35c` | x402 payment verification disabled; verifier hardening and RPC trust-boundary documentation |
| 6 | [#40](https://github.com/Sayed01740/agfusion/pull/40) | `842f6a68473ef8a8575c6c381a8b966e78ae7f1b` | Zod 4/Circle compatibility, Elliptic dependency remediation, audit and CI changes |

All six PRs were last observed open, Draft, and mergeable. No independent review submission or requested reviewer was visible at preparation time. Recheck the exact head SHAs and base chain before starting review; any changed SHA invalidates the corresponding verification record until rerun.

## 2. Evidence available before review

The following are maintainer/CI evidence, not independent approval:

- Exact-head CI completed successfully for all six PRs.
- Exact-head Vercel Preview deployments were reported READY for all six heads.
- PR #39 disposable PostgreSQL integration passed.
- PR #40 CI, dependency audit, and disposable PostgreSQL integration passed.
- PR #40 production dependency audit reported zero vulnerabilities; full dependency-tree high/critical audit passed; four moderate development-tooling advisories remained visible.
- PR #40's audit workflow has a final enforcement step conditioned on an audit failure. That step is expected to be skipped when both preceding audit commands succeed; inspect the two audit step outcomes, not the final step's skipped state in isolation.
- PR #40 Preview read-only smoke checks showed `/api/x402/agent-service` disabled, fabricated payment proof rejected on that route, Arc Testnet chain ID `5042002`, and oversized swap request rejected with HTTP 413. **Important scope correction (observed 2026-11-02):** `/api/x402/risk-oracle` on the same exact PR #40 Preview still returns HTTP 402 with an actionable `accepts[]` requirement, a `payTo` address, and instructions to send native USDC. Therefore x402 is not globally disabled. Treat this endpoint as a release blocker unless the owner explicitly approves its separate active-payment status and the review scope is updated.
- No production environment, production secret, Mainnet setting, wallet signing, or transaction broadcast was changed.

Do not treat a READY Preview as proof that a live Circle quote works. The combined Preview previously reached HTTP 503 for a valid quote request because the Preview Circle server key was not configured. No production credential should be copied into Preview.

## 3. Required review areas

### A. PR #32: shared request-body reader

Review `src/lib/read-limited-json.ts` and its tests.

- Confirm the byte count is based on streamed bytes, not only Content-Length.
- Confirm malformed JSON and invalid UTF-8 fail closed.
- Confirm exact-limit payloads are accepted and limit-plus-one payloads are rejected.
- Check cancellation/error behavior for interrupted streams and reader cancellation.
- Confirm all callers reject non-object JSON or validate the expected schema before field access.
- Check whether any route still calls raw `request.json()` on an unbounded inbound body after the scope of this stack is applied.
- Verify route-specific byte caps are justified by actual payload contracts and do not silently truncate valid provider requests.

Documentation note: `docs/API-REQUEST-BODY-HARDENING-FOLLOWUP.md` identifies its inventory as a historical audit snapshot. Its recorded snapshot SHA is not the current PR #32 head. Confirm the document is clearly treated as historical, and require a fresh repository-wide inbound-body inventory before release.

### B. PR #34: Circle authentication and SIWE

Review both route diffs and tests.

- Confirm oversized requests are rejected before Circle ownership lookup, SIWE verification, user upsert, or session creation.
- Confirm malformed/non-object JSON response behavior remains compatible with clients.
- Exercise valid Circle auth and SIWE requests using the currently supported payload shapes.
- Verify signature, origin, nonce, wallet ownership, session creation, and cookie semantics are unchanged.
- The added tests emphasize negative oversized/malformed cases. Independently verify positive valid-path compatibility; do not infer it from those negative tests.

### C. PR #35 and PR #41: Circle wallet, swap and proxy surfaces

Review every changed route and route test.

- Confirm the size cap is enforced before expensive parsing, provider calls, or state mutation.
- Confirm existing Circle payload fields, optional fields, chain selection, and response contracts are preserved.
- Review positive valid-path coverage for contract execution, challenge, session, token, wallet listing, transaction lookup/persistence, swap preparation, proxy/IRIS, JSON-RPC, and bridge diagnostics.
- Confirm invalid amount forms (including exponent notation and more than six fractional digits) are rejected before Circle SDK initialization.
- Confirm the valid six-decimal prepare-only path still produces the expected quote request without signing or broadcasting.
- Confirm body-size failures are consistently HTTP 413 and malformed/non-object bodies fail closed.
- Verify PR #41 preserves all original swap-prepare regression cases from the superseded PR #36.
- Check whether rate limiting and authentication remain in the intended order relative to body parsing and provider access.

### D. PR #39: x402 and Arc trust boundary

Review the verifier, route behavior, rate limiting, and docs.

- Independently inspect ABI topic address canonicalization: 12 leading zero bytes followed by exactly the 20-byte address.
- Inspect chain-ID parsing and comparison for malformed hex, leading/trailing characters, and exact integer equality.
- Confirm rate-limit counters saturate safely and cannot grow without bound.
- Confirm no unverified `x-payment-tx` or `x-session-auth` header is accepted as payment proof.
- Confirm POST cannot unlock the feed, issue credentials, or accept a fabricated transaction hash.
- Review GET behavior carefully: it returns HTTP 402 and includes `X-Payment-Required: true`, price, token, and chain metadata while also setting `paymentEnabled: false` and omitting a recipient. Determine whether any x402 client could interpret this as actionable payment instructions. If ambiguous, require an explicit non-payment response contract.
- Confirm no recipient or payment destination is exposed while payment verification is disabled.
- Review the documented public RPC trust boundary. A public RPC response is not independent validator/consensus verification. Require an explicit owner decision before relying on it for payment finality.

### E. PR #40: dependency and cryptographic remediation

This is the highest-specialist-review area. CI and npm audit are necessary but not sufficient.

**Circle / Zod compatibility**
- Review the complete `scripts/patch-circle-zod-compat.mjs` diff. It rewrites installed Circle package imports and modifies the installed Zod v3 compatibility runtime under `node_modules`.
- Confirm the patch is deterministic, idempotent, version/layout guarded, and fails closed if upstream package internals change.
- Confirm all relevant Circle import forms are rewritten and no unrelated files or import strings are changed.
- Confirm the array and set guards execute before element parsing and preserve expected validation error semantics.
- Independently test the exact lockfile install from a clean environment, then run the compatibility script twice and verify the second run is a no-op.
- Confirm the production build path always runs the patch before the Circle SDK is imported and that deployment artifacts contain the patched runtime.
- Treat this as a custom downstream compatibility patch, not a vendor-supported fix, unless Circle explicitly confirms support.

**Mapped Elliptic fork**
- Review the complete source diff between upstream Elliptic and the exact published `@mapped/elliptic@6.6.10` tarball.
- Verify registry integrity and SLSA provenance subject digest against the lockfile, and inspect the attested source repository, ref, and build workflow.
- Review the leading-zero P-521 regression and P-256 RFC 6979 known-answer tests.
- Require the upstream Elliptic test suite (or documented equivalent) against the exact attested source revision, including supported curves, nonce boundary/retry cases, and signature verification.
- Establish runtime reachability of the nested signing implementation for supported wallet modes. Transitive inclusion alone is not proof that every signing path invokes it.
- Obtain independent cryptographic review; package signatures and provenance do not establish cryptographic correctness.

**Dependency audit and CI**
- Re-run `npm ci --legacy-peer-deps`, `npm audit --omit=dev`, and full `npm audit` against the exact final head.
- Record the four moderate development-tooling advisories and their fix availability. Do not suppress them or describe the full tree as vulnerability-free.
- Confirm production audit remains at zero and full-tree high/critical remains zero.
- Verify the audit workflow's two command outcomes directly. The final enforcement step being skipped after successful audit commands is expected conditional behavior, not itself a pass/fail result.

## 4. Mandatory reviewer test matrix

The reviewer should record PASS / FAIL / NOT RUN, command or test evidence, and any finding for each item:

1. Clean install from the exact final lockfile.
2. Request-body helper boundary tests: below cap, exact cap, over cap, absent/understated Content-Length, malformed JSON, invalid UTF-8, aborted stream.
3. Positive valid request tests for Circle auth and SIWE.
4. Positive valid request tests for each changed Circle PW route.
5. Swap prepare validation: invalid amount cases and valid six-decimal prepare-only quote path.
6. Proxy / IRIS / JSON-RPC / bridge-diagnostics body limits and valid payload compatibility.
7. x402 endpoint-by-endpoint negative tests: agent-service and risk-oracle must each match the owner-approved enablement state; when globally disabled, neither endpoint may disclose a recipient/payment challenge, accept/consume payment, issue credentials, or unlock paid data. Test fabricated transaction proof rejection.
8. Circle SDK import/initialization and compatibility tests from a clean install.
9. Elliptic full diff, provenance, upstream test suite, and targeted regression review.
10. Production and full dependency audit results.
11. Exact-head CI and Vercel Preview status after all review changes.
12. Read-only Preview smoke test. No wallet signing, transaction broadcast, or real payment.

## 5. Acceptance and stop conditions

Do not approve the stack if any of these is true:

- Any exact head changed after the evidence above and its checks were not rerun.
- A valid Circle auth, SIWE, wallet, or swap request shape is broken or lacks adequate compatibility evidence.
- The Zod patch is brittle, non-reproducible, or does not guard the exact runtime used in production.
- The Elliptic fork diff, provenance, or upstream tests cannot be independently verified.
- Any production moderate+ advisory or full-tree high/critical advisory remains unexplained or newly appears.
- Any x402 endpoint publishes actionable payment instructions while the owner says x402 is disabled, accepts unverified payment evidence, or unlocks paid data contrary to the approved scope.
- The RPC trust model remains undocumented or owner-unapproved for the intended use.
- Any test requires production credentials or an actual user transaction.

Any reviewer-requested code change requires a new exact-head CI, audit, Preview, and smoke-test pass. Keep every security PR Draft until the independent review is complete and findings are resolved.

## 6. Explicit non-goals

This review package does not authorize:

- Merging any security PR.
- Marking any PR ready for review or assigning an unconfirmed reviewer.
- Production deployment or production environment changes.
- Mainnet activation or Mainnet transaction execution.
- Wallet signing, transaction broadcast, or live payment acceptance.
- Using production Circle credentials in Preview.

## 7. Reviewer response template

Please submit an independent GitHub review with:

- Reviewer identity and relevant security / cryptography experience.
- Exact PR head SHAs reviewed.
- PASS / FAIL / NOT RUN for each mandatory test matrix item.
- Findings classified by severity, affected file/line, impact, and concrete remediation.
- Explicit approval or request-changes decision for each PR.
- Any residual risk accepted by the repository owner, with rationale.

A green CI run is not an independent review. This package is intended to make the review reproducible and auditable, not to replace it.


## 8. New release-blocking finding: risk-oracle payment challenge remains live

**Observed:** 2026-11-02, read-only GET against the integrated PR #40 Preview deployment for exact head `842f6a68473ef8a8575c6c381a8b966e78ae7f1b`.

- `GET /api/x402/agent-service` returns HTTP 402 with `paymentEnabled:false`, no recipient, and a warning not to send funds.
- `GET /api/x402/risk-oracle` returns HTTP 402 with an `accepts[]` exact-payment requirement, `payTo: 0xB00f41172c23d31571a3bE850AA0e81e58Ab8828`, and a note instructing users to send native USDC on Arc Testnet and retry with `paymentTxHash`.
- The risk-oracle route source on the integrated PR #40 branch still contains the payment-requirements response and payment verification/consumption flow.

**Decision required:** Repository owner must explicitly decide whether risk-oracle payment is intentionally active while agent-service x402 is disabled. Until that decision is recorded, do not describe x402 as globally disabled and do not release the stack. If global disablement is intended, disable both GET and POST payment paths, remove the payment destination and actionable challenge, and add endpoint-specific regression tests. No POST payment request was made and no funds were sent during this finding.
