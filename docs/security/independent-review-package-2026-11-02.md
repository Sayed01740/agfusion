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
| 6 | [#40](https://github.com/Sayed01740/agfusion/pull/40) | `3aebdc6e15946bc73baa18e42f430467be82d1a2` | Zod 4/Circle compatibility, Elliptic dependency remediation, x402 fail-closed routes, audit and CI changes |

All six PRs were last observed open, Draft, and mergeable. No independent review submission or requested reviewer was visible at preparation time. Recheck the exact head SHAs and base chain before starting review; any changed SHA invalidates the corresponding verification record until rerun.

## 2. Evidence available before review

The following are maintainer/CI evidence, not independent approval:

- Exact-head CI completed successfully for all six PRs.
- Exact-head Vercel Preview deployments were reported READY for all six heads.
- PR #39 disposable PostgreSQL integration passed.
- PR #40 CI, dependency audit, and disposable PostgreSQL integration passed.
- PR #40 production dependency audit reported zero vulnerabilities; full dependency-tree high/critical audit passed; four moderate development-tooling advisories remained visible.
- PR #40's audit workflow has a final enforcement step conditioned on an audit failure. That step is expected to be skipped when both preceding audit commands succeed; inspect the two audit step outcomes, not the final step's skipped state in isolation.
- On the superseded PR #40 Preview head, Risk Oracle was subsequently confirmed to expose an actionable HTTP 402 payment challenge. That historical finding was addressed by the owner-approved global x402 shutdown. On the current exact head `3aebdc6e15946bc73baa18e42f430467be82d1a2`, both Risk Oracle and Agent Service return HTTP 503 / `X402_DISABLED` for GET and POST, with no payment challenge, recipient, or payment metadata. Six direct Preview smoke tests passed on this exact head (see Section 10).
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


## 8. Owner-approved x402 global disablement and current Preview verification

**Owner decision:** On 2026-11-02 the repository owner approved temporarily disabling Risk Oracle paid functionality as part of the x402 shutdown while independent security review is pending. The implementation scope is both x402 endpoints in this stack.

**Implementation branch:** `security/integrated-zod4-dependency-remediation`  
**Latest implementation head at time of this update:** `3aebdc6e15946bc73baa18e42f430467be82d1a2`

Both endpoints now fail closed on GET and POST with HTTP 503, `code=X402_DISABLED`, and `Cache-Control: no-store`. Neither endpoint should publish an x402 challenge, payment recipient, amount, token/chain settlement metadata, or actionable payment headers. Neither accepts payment evidence or unlocks paid data.

### Exact-head automated evidence

- The earlier `2d23fc6aa4bb35656223c50a1684da35959fcdb9` evidence is historical and is superseded by the exact-head evidence in Section 10.
- On current exact head `3aebdc6e15946bc73baa18e42f430467be82d1a2`, GitHub CI, dependency audit, disposable PostgreSQL integration, and Vercel Preview all completed successfully. The direct Preview checks are also recorded in Section 10.
- Four moderate development-tooling advisories remain on the committed code head; production audit reported zero vulnerabilities and the full-tree high/critical gate passed.

### Read-only Preview smoke tests on prior exact head

Preview deployment `dpl_6nYUyd7ivJZXy342eCyXBSMQMQNT` at `2d23fc6aa4bb35656223c50a1684da35959fcdb9` returned:

- Risk Oracle GET: HTTP 503, `X402_DISABLED`, no payment headers or destination.
- Risk Oracle POST with a fabricated transaction hash: HTTP 503, same disabled response.
- Risk Oracle POST with malformed JSON: HTTP 503, same disabled response.
- Agent Service GET: HTTP 402 with `X-Payment-Required: true`, price/token/chain metadata, despite `paymentEnabled:false`. This is a newly identified inconsistency and is addressed by the new agent-service code change, which still needs exact-head CI and Preview verification.

No real payment was submitted, no wallet was used, and no funds were sent.

## 9. Updated release blockers

- Independent review is still required for request-body changes, the Circle/Zod compatibility patch, the complete Elliptic fork diff, x402 verifier/trust boundary, and public Arc RPC assumptions.
- Obtain an explicit owner decision on the public Arc RPC trust model before any future payment-finality reliance.
- Resolve or formally disposition the four moderate development-tooling advisories.
- Complete TypeScript/TSX lint coverage and Next.js ESLint plugin integration; the current committed PR #43 rules cover JS/CommonJS/ESM only. The broader candidate remains uncommitted (Sections 14 and 16).
- Assess the remaining Viem/Ox Tempo dynamic dependency import build warning.

Keep every PR Draft. No merge, Production deployment, Mainnet activation, wallet signing, transaction broadcast, or payment acceptance is authorized.


## 10. Final exact-head verification after global x402 disablement

**Code PR #40 head:** `3aebdc6e15946bc73baa18e42f430467be82d1a2`  
**Preview deployment:** `dpl_Dq7uMsWa5mURfW8kRSvzNzcppbUt`  
**Preview URL:** https://agfusion-mmyprnlab-sayeds-projects-e086c1e7.vercel.app

All exact-head GitHub workflows completed successfully on this code head:

- CI run `41489279355`: dependency install, Circle SDK compatibility, Elliptic regression, `npm run lint`, TypeScript, Vitest, and production build all completed successfully.
- Dependency audit run `41489279388`: production audit reported zero vulnerabilities; full-tree high/critical gate passed; four moderate development-tooling advisories remain visible. The conditional enforcement step was skipped because the preceding audit gates passed.
- Disposable PostgreSQL integration run `41489279360`: Prisma generation, disposable schema apply, and real PostgreSQL integration tests passed.
- Vercel Preview for this exact SHA reached READY.

### Direct Preview smoke test results

Executed from an ephemeral Vercel sandbox against the exact READY Preview. All six checks passed:

1. Risk Oracle GET returned HTTP 503 / `X402_DISABLED`.
2. Risk Oracle POST with a fabricated transaction hash returned HTTP 503 / `X402_DISABLED`.
3. Risk Oracle POST with malformed JSON returned HTTP 503 / `X402_DISABLED`.
4. Agent Service GET returned HTTP 503 / `X402_DISABLED`.
5. Agent Service POST with fabricated `x-payment-tx` and `x-session-auth` headers returned HTTP 503 / `X402_DISABLED`.
6. Agent Service POST with malformed JSON returned HTTP 503 / `X402_DISABLED`.

Each response was checked for `Cache-Control: no-store`, absence of x-payment headers, and absence of payment challenge fields such as `accepts`, `payTo`, `price`, `settlement`, `paymentEnabled`, and paid/authorization fields. No wallet, real payment, transaction broadcast, or funds were used.

### Remaining tooling and review caveats

- PR #43 now carries the full TypeScript/TSX flat-ESLint configuration, Next.js plugin, and React Hooks rules. Exact-head lint covers 201 files with 0 errors and 173 warnings (95 explicit-any, 74 unused-vars, 2 Next.js warnings, 1 React Hooks exhaustive-deps warning, and 1 unused-disable warning). Treat these warnings as visible cleanup debt; do not suppress them wholesale.
- The four moderate development-tooling advisories on the earlier PR #40 dependency tree are addressed in PR #43's matching manifest and lockfile with `minimatch@11.0.4`. The exact verification-head dependency audit passed, and both production and full-tree moderate-level audits reported zero vulnerabilities. This remediation is part of the Draft PR #43 stack and is not present on PR #40 in isolation.
- Vercel Preview builds no longer report the empty-ESLint-config or missing-Next-plugin warning. The remaining build warning is the dynamic dependency import in `ox/_esm/tempo/internal/virtualMasterPool.js`, reached through Viem Tempo and Circle's Viem adapter. Builds pass, but this warning still merits dependency/bundler review. Vercel also uses Node 22 because the package engine range is `>=22 <23`, overriding the project's Node 24 setting.
- No independent security reviewer has submitted an approval. The public Arc RPC trust boundary still requires explicit owner acceptance before any future payment-finality reliance.

### Current decision

The x402 payment challenge inconsistency remains resolved. PR #43 now includes full TS/TSX lint coverage and the compatible minimatch remediation; exact-head CI, dependency audit, PostgreSQL integration, and Preview checks have passed. The stack remains Draft and is **not approved for merge or Production deployment** until independent security review and the public Arc RPC trust-boundary decision are complete. The 173 lint warnings and the remaining Viem/Ox build warning stay visible for follow-up.


## 11. Review-package CI completion

The documentation package was validated on its earlier head `0ffa192a468b93c539315421861686bec3833467` (CI run `41511664231`, run 939). It has since been updated again.

- PR #42 head `6a83c78c735f967e1fc4538dbc1a1c49b49fa072` passed GitHub CI run `41517342053` (run 948), including clean install, TypeScript typecheck, tests, and production build.
- This validates the documentation branch's configured CI workflow only. It does not constitute independent security review, approval of the code PR stack, or authorization to merge/deploy. Any follow-on documentation-only edits are subject to the same CI gate.

The current release decision remains unchanged: keep all security PRs Draft, retain the global x402 shutdown, and do not merge or deploy Production until independent review and the public Arc RPC trust-boundary decision are complete.


## 12. Incremental ESLint baseline PR (historical starting point)

This section records the initial PR #43 state before the full TypeScript/TSX and minimatch remediation described in Section 18. A separate Draft code PR was opened to replace the empty ESLint placeholder with active core safety rules:

- PR #43: https://github.com/Sayed01740/agfusion/pull/43
- Branch: `security/eslint-config-minimatch-remediation`
- Head: `276b2d965e8c7078a352b24044adccefb46e35e8`
- Parent: code PR #40 head `3aebdc6e15946bc73baa18e42f430467be82d1a2`

The configuration now actively checks JavaScript, CommonJS, and ES module tooling/configuration files for debugger statements, constant conditions, duplicate keys, unreachable code, invalid typeof checks, eval/new Function/implied eval, unsafe prototype method calls, and empty blocks (except empty catch blocks). It excludes generated output and dependencies. It adds no dependencies and does not alter the lockfile.

**Scope limitation:** This is an incremental baseline only. TypeScript and TSX application files are not yet parsed by ESLint. TypeScript typecheck and the existing test suite remain separate checks; they are not a substitute for TypeScript lint coverage. The Next.js-specific ESLint plugin warning may remain. Do not mark the overall lint release blocker fully resolved until TypeScript/TSX lint coverage and Next.js plugin integration are addressed.

Local validation on the exact parent code head under Node 22: clean `npm ci --legacy-peer-deps` followed by `npm run lint` completed successfully with the new rules. PR #43 exact-head GitHub CI and dependency audit subsequently completed successfully (Section 13). The separate moderate development-tooling audit finding is not fixed by PR #43.


## 13. PR #43 initial baseline CI and dependency audit (historical)

PR #43's initial baseline head `276b2d965e8c7078a352b24044adccefb46e35e8` completed both configured GitHub workflows. This state is superseded by the full remediation and exact-head results in Section 18:

- CI run `41493479608` (run 933): success. The configured sequence completed clean install, Circle SDK compatibility checks, Elliptic leading-zero regression, ESLint, TypeScript typecheck, Vitest, and production build.
- Dependency security audit run `41493479584` (run 219): success. Production dependency audit and full-tree high/critical gates passed. The development dependency report still lists the moderate minimatch advisory and its transitive ESLint chain (`minimatch`, `@eslint/config-array`, `@eslint-community/eslint-utils`, and `eslint`). The audit workflow's enforcement step was skipped because its preceding severity gates passed; this does not mean the moderate advisory is fixed.

At that historical head, PR #43 did not change the dependency graph and lint scope was JavaScript/CommonJS/ESM only. The full remediation now appears in Section 18. No independent security review has been received, and no merge or Production deployment is authorized.


## 14. Initial candidate full TypeScript/TSX lint and minimatch remediation experiment (historical)

A second disposable Node 22 sandbox test was run from PR #43's exact parent code head `276b2d965e8c7078a352b24044adccefb46e35e8`. At that time this was a candidate experiment only. The candidate was subsequently revalidated, committed, and verified as documented in Section 18.

Candidate toolchain versions:

- `@eslint/js@10.0.1`
- `@next/eslint-plugin-next@15.5.28` (aligned to the repository's Next.js 15.5.28 line)
- `@typescript-eslint/eslint-plugin@8.72.1`
- `@typescript-eslint/parser@8.72.1`
- `eslint-plugin-react-hooks@7.1.1`
- `globals@17.14.0`
- top-level npm override `minimatch@^11.0.4`; clean lock resolution placed `minimatch@11.0.4` under the affected ESLint dependency chain.

The candidate flat config parses `.js`, `.mjs`, `.cjs`, `.ts`, and `.tsx`; applies ESLint recommended rules, TypeScript recommended rules, Next.js recommended rules, React Hooks rules-of-hooks and exhaustive-deps; and excludes generated output and dependencies.

**Exact sandbox validation after a clean `npm ci --legacy-peer-deps`:**

- `npm run lint`: exit 0, 0 errors and 181 warnings across 55 files. Warning breakdown: 95 explicit-any, 80 unused-vars, 2 ts-nocheck comments, 2 Next.js rules, 1 React Hooks dependency warning, and 1 unused disable directive. These are visible cleanup debt, not resolved findings.
- `npm run typecheck`: pass.
- Circle SDK/Zod compatibility test: pass.
- Elliptic leading-zero and P-256 regression tests: pass.
- Vitest: 33 files passed, 1 skipped; 214 tests passed, 4 skipped.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities.
- `npm audit --audit-level=moderate`: 0 vulnerabilities (including development dependencies) in this candidate lockfile.
- `npm run build`: pass; Next.js ESLint plugin/empty-config warnings no longer appeared. The existing Viem/Ox dynamic dependency import warning remains.

**Historical repository status at the time of this experiment:** PR #43 still contained only the earlier JavaScript/CommonJS/ESM lint baseline. This was later superseded by the committed candidate and exact-head CI, audit, PostgreSQL, and Preview evidence in Section 18. No merge or Production approval follows from the sandbox experiment alone.


## 15. Requested-chain ID consistency finding: fix present in PR #40 code

GitHub issue #38 records a correctness finding in `src/app/api/circle/swap/prepare/route.ts`: the earlier implementation could label a prepared response using the runtime default chain ID rather than the validated request chain ID.

**Current code inspection on PR #40 branch `security/integrated-zod4-dependency-remediation`:**

- The route now returns the validated `chainId` in its successful response.
- The route tests include mocked App Kit cases for both Arc Testnet `5042002` and Arc Mainnet `5042`, and assert that the response `chainId` matches the request.
- These tests exercise quote preparation only. They do not sign or submit a transaction.

This indicates the reported mismatch is addressed in the inspected PR #40 branch. However, issue #38 remains open as a GitHub tracking item, and the fix must remain part of the exact reviewed stack. Confirm the same code and tests are present on the final integrated head, and ensure the reviewer includes this change in the positive-path swap-prepare review.

Issue: https://github.com/Sayed01740/agfusion/issues/38

Do not infer that the entire swap flow is approved from this targeted regression test. The test is separate from the x402 shutdown and does not authorize Mainnet activation or transaction execution.

## 16. Follow-up status: full lint candidate committed and verified

The earlier Vercel v4 sandbox-creation failures were bypassed by creating a fresh Node 22 sandbox through the v2 API. The initial large-file transfer attempt was truncated and immediately reverted; no partial package manifest or lockfile remains from that failed attempt.

A one-time, narrowly scoped GitHub Actions workflow then generated the manifest, matching lockfile, and flat ESLint config directly in CI, ran the full validation suite, removed itself, and committed the three files atomically.

- Candidate code commit: `0090c9a8ec272f883c6fafca373d5543f38431ac`.
- Exact verification commit with the same tree: `951ead919fa2ac0518a0cee0e39a4a829bdedf81`.
- The temporary workflow file is deleted from the branch.
- The previous incomplete-transfer commit was reverted as `2ad63d778fb18b0730bba8d989ca116b2c0e46c1`. It remains in Git history as a revert target, but its incomplete tree is superseded by the later candidate commit; the current branch tree contains the complete, validated package manifest and lockfile.

The one-time validation workflow run `41515995381` completed successfully. Exact verification-head GitHub CI run `41516572024` (run 946), dependency audit run `41516572322` (run 224), and disposable PostgreSQL integration run `41516572132` (run 70) all completed successfully. The exact verification-head Vercel Preview `dpl_AnBaF26QMDNkxzxJWKmsYfMXAFYN` reached READY.

The candidate is now repository code on Draft PR #43, not merely a sandbox experiment. It remains unapproved for merge/Production pending independent review and the public Arc RPC trust-boundary decision.




## 18. Full TypeScript/TSX lint and minimatch remediation: exact-head evidence (2026-11-03)

PR #43 now contains the full remediation candidate. Its code commit is `0090c9a8ec272f883c6fafca373d5543f38431ac`; the follow-up exact-verification commit is `951ead919fa2ac0518a0cee0e39a4a829bdedf81` and has the same tree. The temporary workflow used to generate and validate the candidate was deleted in the candidate commit.

The candidate adds `@eslint/js@10.0.1`, `@next/eslint-plugin-next@15.5.28`, `@typescript-eslint/eslint-plugin@8.72.1`, `@typescript-eslint/parser@8.72.1`, `eslint-plugin-react-hooks@7.1.1`, `globals@17.14.0`, and npm override `minimatch@^11.0.4`. The committed lockfile resolves the affected `minimatch` package to `11.0.4`. The flat config parses JS, MJS, CJS, TS, and TSX; enables Next.js rules and React Hooks rules-of-hooks/exhaustive-deps; and keeps explicit-any/unused-vars warnings visible.

### Clean-install validation

One-time GitHub Actions workflow run `41515995381` completed successfully after generating the candidate in a clean Node 22 runner. Its validation step completed:

- Clean `npm ci --legacy-peer-deps`.
- ESLint over 201 files: 0 errors and 173 warnings (95 explicit-any, 74 unused-vars, 2 Next.js rules, 1 React Hooks exhaustive-deps, 1 unused-disable warning).
- TypeScript typecheck: pass.
- Circle SDK/Zod compatibility and bounded-collection security checks: pass.
- Elliptic P-521 leading-zero and P-256 RFC 6979 known-answer regression checks: pass.
- Vitest: 33 files passed, 1 skipped; 214 tests passed, 4 skipped.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities.
- `npm audit --audit-level=moderate`: 0 vulnerabilities across production and development dependencies.
- Production build: pass.

### Exact verification-head repository checks

The verification commit `951ead919fa2ac0518a0cee0e39a4a829bdedf81` passed:

- GitHub CI run `41516572024` (run 946): clean install, Circle SDK/Zod, Elliptic regression, lint, TypeScript, Vitest, and production build all succeeded.
- Dependency security audit run `41516572322` (run 224): workflow completed successfully; production audit and full-tree high/critical gates passed. The candidate full-tree moderate-level audit reported zero vulnerabilities in the one-time validation workflow.
- Disposable PostgreSQL integration run `41516572132` (run 70): Prisma client generation, disposable schema apply, and real PostgreSQL integration tests passed.
- Vercel Preview for the exact verification commit: deployment `dpl_AnBaF26QMDNkxzxJWKmsYfMXAFYN`, URL https://agfusion-ph33l3fte-sayeds-projects-e086c1e7.vercel.app, state READY.
- Candidate code Preview: deployment `dpl_3RbcCpdc26LjiQuu5DirfKTQhHwq`, URL https://agfusion-mgfxbnhf1-sayeds-projects-e086c1e7.vercel.app, state READY.

### Exact Preview x402 smoke tests

All six direct tests passed on both the candidate Preview and the exact verification Preview:

1. Risk Oracle GET.
2. Risk Oracle POST with a fabricated payment transaction hash.
3. Risk Oracle POST with malformed JSON.
4. Agent Service GET.
5. Agent Service POST with fabricated `x-payment-tx` and `x-session-auth` headers.
6. Agent Service POST with malformed JSON.

Every response was HTTP 503 / `X402_DISABLED`, included `Cache-Control: no-store`, and exposed no x-payment headers or payment challenge/body metadata (`accepts`, `payTo`, `price`, `settlement`, `paymentEnabled`, payment hash, paid, or authorized fields). No real payment, wallet, funds, or transaction broadcast was used.

**Remaining caveats:** 173 lint warnings remain visible cleanup debt. Vercel no longer reports the empty-ESLint-config or missing-Next-plugin warning. The existing dynamic dependency import warning in `ox/_esm/tempo/internal/virtualMasterPool.js` remains, as does the Vercel Node 22 engine-selection warning. These are recorded for review, not hidden or claimed fixed.

**Release decision:** PR #43 remains Draft and unmerged. No independent security review has been submitted. The public Arc RPC trust boundary still requires explicit owner acceptance before any future payment-finality reliance. This remediation does not authorize merge, Production deployment, Mainnet activation, or x402 payment re-enablement.


## 19. Review-package documentation head: exact CI recheck (2026-11-04)

The latest documentation-only PR #42 head `a1ebb60b20a718cef33257af4ecfdb2970dd7bd5` has now completed GitHub CI successfully (run `41517677875`). This supersedes the earlier note that its latest workflow had not yet appeared.

The current code verification heads remain unchanged and their exact-head workflows are green:

- PR #40 `3aebdc6e15946bc73baa18e42f430467be82d1a2`: CI `41489279355`, dependency audit `41489279388`, and disposable PostgreSQL integration `41489279360` all succeeded.
- PR #43 `951ead919fa2ac0518a0cee0e39a4a829bdedf81`: CI `41516572024`, dependency audit `41516572322`, and disposable PostgreSQL integration `41516572132` all succeeded.
- PR #43's recorded Preview reached READY and its six read-only x402 smoke tests returned HTTP 503 / `X402_DISABLED` with no payment challenge metadata.

No independent review has been submitted on PR #40, #42, or #43. The public Arc RPC trust-boundary decision remains open. The 173 ESLint warnings and the dynamic Viem/Ox Tempo dependency import warning remain visible cleanup/review items. This update records evidence only; it does not change the release gates or authorize merge, Production deployment, Mainnet activation, wallet signing, transaction broadcast, or x402 re-enablement.


## 20. Arc Testnet read-only Preview smoke and Vercel configuration review (2026-11-04)

A narrowly scoped GitHub Actions workflow was added at `.github/workflows/arc-testnet-readonly-preview-smoke.yml` on the documentation review branch. It targets only the already-built PR #43 Preview at `https://agfusion-ph33l3fte-sayeds-projects-e086c1e7.vercel.app`; it does not deploy or modify that Preview.

- Workflow run: `41798401917` — **success**.
- Exact tested application commit: `951ead919fa2ac0518a0cee0e39a4a829bdedf81`.
- Vercel Preview deployment: `dpl_AnBaF26QMDNkxzxJWKmsYfMXAFYN` — **READY**.
- Default `GET /api/rpc?chain=arc`: passed; response asserted `ok=true`, chain ID `0x4cef52`, expected chain ID `0x4cef52`.
- Explicit `GET /api/rpc?chain=arc_testnet`: passed with chain ID and expected chain ID `0x4cef52`.
- `GET /api/x402/agent-service`: HTTP 503, `X402_DISABLED`, `Cache-Control: no-store`, no payment challenge metadata.
- `GET /api/x402/risk-oracle`: HTTP 503, `X402_DISABLED`, `Cache-Control: no-store`, no payment challenge metadata.

These were GET-only health and disabled-state checks. No JSON-RPC transaction method, wallet, signature, approval, token transfer, payment, database mutation, or Mainnet endpoint was invoked.

### Vercel production/preview separation

The Vercel project inventory reports the verified project domain `agfusion.vercel.app`. The latest listed Production deployment remains on `master` commit `4c9ef13c89f29a82b172a990af13e38850ff7e09` (deployment `dpl_3ByoQdwur2b9TkQ3SxKfiMXeW1v4`). The security remediation candidate is a separate Preview deployment; it has not been promoted to Production. Keep that separation until independent review and owner approval.

The environment-variable inventory was inspected with decryption disabled. The listed variables are scoped to Production; no Preview-target variables were present in that inventory. Vercel metadata marked four Production variables with the `readable-secret` security issue: `KIT_KEY`, `CIRCLE_API_KEY`, `BAZAARLINK_API_KEY`, and `DATABASE_URL`. Their values were not decrypted or copied. This metadata flag is not proof of external compromise, but the owner should review who can read project secrets, restrict access, and rotate any value if access cannot be confidently bounded. Do not expose these values in Preview or logs.

### Current open release gates

- Independent cryptographic review of the mapped Elliptic fork and runtime reachability.
- Independent Circle/Zod patch review.
- Trusted Vercel/Cloudflare ingress identity decision for x402.
- Arc finality/RPC trust decision.
- Database owner approval, restorable backup, and manual schema rollout plan.
- Complete audit monitoring, alert routing, retention, and operational ownership.
- Review of Vercel's four `readable-secret` flags and remediation/rotation decision.

This section records read-only evidence only. It does not authorize merge, Production promotion, environment changes, database migration, Mainnet activation, wallet signing, transaction broadcast, or x402 re-enablement.


## 21. Final documentation Preview build and RPC proxy source-review findings (2026-11-04)

### Documentation branch CI and Preview

The latest documentation commit `d9606b10d214366254b3f42bc5aec2e6fe9791c5` completed GitHub Actions CI run `41798473569` successfully. The `check` job completed clean install, TypeScript typecheck, Vitest, and production build with a successful conclusion.

The corresponding Vercel Preview deployment `dpl_G2wrPayQ6NNb3zjYUUaMTfXGxcou` reached **READY** for the same commit. This is the documentation branch Preview, not a new application-code release. The separate PR #43 application Preview remains the target of the read-only Arc Testnet smoke workflow.

The newest smoke workflow run `41798465864` also succeeded on the documentation update commit. It tested only the already-built PR #43 Preview: default Arc alias and explicit Arc Testnet both returned chain ID `0x4cef52`; both x402 endpoints remained HTTP 503 / `X402_DISABLED`, `Cache-Control: no-store`, with no payment challenge metadata. These were GET-only checks.

### Additional RPC proxy source review

A follow-up source review inspected `src/app/api/rpc/route.ts`, `src/lib/rpc-proxy.ts`, and `src/lib/rate-limit.ts` on `master`, and compared PR #41's RPC changes. PR #41 adds the 128 KiB streamed request-body cap and regression tests, but does not change RPC method classification or reject JSON-RPC batch arrays.

A new tracking issue records the remaining design risks: [Issue #45](https://github.com/Sayed01740/agfusion/issues/45).

- The current write-method denylist contains only `eth_sendRawTransaction`, `eth_sendTransaction`, `eth_sign`, `personal_sign`, and `eth_signTypedData_v4`. Wallet signing/submission methods such as `eth_signTransaction`, other typed-data variants, EIP-5792 `wallet_sendCalls`, and ERC-4337 `eth_sendUserOperation` need explicit assessment against the app's supported provider surface.
- The RPC route accepts JSON arrays. A batch request has no top-level `method`, so it can enter the read failover loop. If a batch contains a write and an upstream processes it before returning an unusable response, forwarding the same body to another upstream can risk duplicate submission.
- Safer direction: use a strict read-only method allowlist for retry/failover; reject batch arrays unless every item is independently classified and the whole batch is sent under a no-retry policy; treat unknown methods as non-retryable or reject them; preserve single-submit/no-retry behavior for writes.
- `clientIp()` trusts the first `x-forwarded-for` value and then `x-real-ip`. Confirm Vercel's ingress overwrites/sanitizes these headers before treating them as an abuse-control identity. The limiter is in-memory and single-instance, not a global serverless limit.

These are source-level findings and deployment-boundary questions, not evidence that an exploit has occurred. No RPC write, batch transaction, wallet signature, broadcast, Mainnet request, or Production configuration change was performed.

### Release implications

Keep PR #41 and the wider security stack Draft. Before merge or Production promotion, resolve Issue #45 with fail-closed RPC routing, batch handling tests, trusted proxy-header verification, and an explicit decision on distributed rate limiting. Independent security review remains outstanding. No release gate is waived by the successful documentation CI or Preview build.


## 22. RPC allowlist / batch guard candidate and Vercel ingress evidence (2026-11-04)

### Draft implementation PR #46

A separate Draft PR #46 has been opened on top of PR #41:

- PR: https://github.com/Sayed01740/agfusion/pull/46
- Branch: `security/rpc-readonly-allowlist-batch-guard`
- Base: PR #41 head `1dca9263f2901f0aa5c61a7c4330f2bbeb932c53`
- Latest candidate head at documentation time: `30d6e9f159dc351f6349885531a09dc25d7235da`

The candidate:
- Uses an explicit allowlist for read-only methods eligible for retry/failover.
- Classifies common signing and state-changing methods as non-retryable, including `wallet_sendCalls` and `eth_sendUserOperation`.
- Rejects JSON-RPC batch arrays before contacting an upstream.
- Rejects unknown methods and invalid JSON-RPC request envelopes before routing.
- Excludes stateful filter methods from the retryable read set.
- Adds regression tests for mixed read/write batch rejection, unknown methods, classification boundaries, and single-attempt handling of a signing method.

This changes compatibility: unsupported methods and JSON-RPC batches now receive HTTP 400. Confirm the exact wallet/provider method surface used by AGFusion before merging. PR #46 is Draft; its exact-head CI and Preview are pending at the time of this documentation update. Do not describe this candidate as verified or production-ready until those checks complete.

### Provider-surface inspection

The wallet-provider code uses the browser-injected wallet directly for `eth_accounts` and `eth_requestAccounts`. The same-origin RPC proxy is used for viem public-client reads such as balance retrieval, and the wallet RPC guard uses the proxy for `eth_getTransactionCount`. These observed methods are included in the read allowlist where applicable. This source inspection is not a complete runtime trace of every SDK or third-party wallet call; validate the exact provider traffic on Preview before release.

### Vercel ingress header behavior

Vercel's current request-header documentation states that ordinary Vercel ingress overwrites incoming `X-Forwarded-For` and does not forward externally supplied IP values, to prevent spoofing. It also states that `X-Real-IP` is identical to `X-Forwarded-For`. Therefore, the source concern about arbitrary caller-supplied XFF values is resolved for requests served directly through the normal Vercel ingress, subject to the actual project topology and any upstream proxy / Enterprise Trusted Proxy configuration.

Source: https://vercel.com/docs/headers/request-headers

The in-memory rate limiter remains per-instance, not a distributed global quota across serverless instances. Decide whether that limitation is acceptable for the expected threat model and traffic, or whether a shared store is required. Do not claim the distributed limiter question is resolved.

No signing, transaction broadcast, Mainnet request, Production change, or secret decryption was performed for this candidate.


## 23. RPC allowlist candidate: exact-head CI and Preview smoke evidence (2026-11-04)

**Draft PR #46 exact head:** `30d6e9f159dc351f6349885531a09dc25d7235da`  
**GitHub Actions CI:** run `41800688483` (run 958) — completed successfully. The check job passed clean dependency installation, TypeScript typecheck, Vitest, and production build.  
**Vercel Preview:** deployment `dpl_D8LBCiC4KBxx1xJ4k4zKFKsJUsGT`, URL https://agfusion-r37f1jxnf-sayeds-projects-e086c1e7.vercel.app — READY for the same exact commit.

### Direct read-only Preview smoke

Executed from an ephemeral Vercel sandbox against the exact Preview URL above:

1. `GET /api/rpc?chain=arc`: HTTP 200; `ok=true`; upstream identified as Arc Testnet; chain ID and expected chain ID both `0x4cef52`.
2. JSON-RPC `eth_chainId`: HTTP 200; result `0x4cef52`.
3. JSON-RPC `eth_blockNumber`: HTTP 200; returned a current Testnet block number.
4. Mixed JSON-RPC batch containing `eth_blockNumber` and `eth_sendRawTransaction`: HTTP 400 / `-32600`, `JSON-RPC batch requests are not supported`. The request was rejected at the route boundary; no upstream transaction submission was attempted.
5. Unknown method `debug_unknownMethod`: HTTP 400 / `-32601`, `Unsupported JSON-RPC method`.
6. `eth_accounts` sent to the same-origin proxy: HTTP 400 / `-32601`; this method remains the responsibility of the injected wallet provider.
7. `eth_requestAccounts` sent to the same-origin proxy: HTTP 400 / `-32601`; this method remains the responsibility of the injected wallet provider.

All JSON-RPC responses carried `Cache-Control: no-store`. No wallet signature, transaction broadcast, real payment, database mutation, or Mainnet request was performed.

### Documentation branch exact-head recheck

The documentation branch commit `b6cb48a776581b49cd655d11b06abd3995e57a6c` completed GitHub CI run `41800745385` (run 959) successfully, including clean install, typecheck, Vitest, and production build. Its corresponding Vercel Preview deployment `dpl_9Kwc7L1pkQCi8GT4PJa6QnG17aom` reached READY.

### Remaining release gates

- PR #46 remains a Draft candidate and has no independent review submission.
- The GitHub review list for PR #46 and PR #42 was empty at this check. No reviewer identity is confirmed; do not invent or assign an unverified reviewer.
- Confirm compatibility with the full wallet/provider method surface through additional runtime traces and integration coverage.
- Decide whether the in-memory per-instance rate limiter is acceptable or a distributed limiter is required.
- Retain the Vercel ingress qualification: the documented overwrite behavior applies to ordinary Vercel ingress and depends on actual upstream/Enterprise Trusted Proxy topology.
- Complete independent security and cryptographic review of the integrated stack.

These successful CI and Preview checks are maintainer verification only. They do not constitute independent approval or authorize merge, Production promotion, Mainnet activation, wallet signing, transaction broadcast, or x402 re-enablement.

## 24. Circle Kit client-bundle and Mainnet preparation boundary follow-up (2026-11-04)

### Source review on PR #46 candidate branch

The exact PR #46 branch was inspected for:
- `src/lib/circle-kit-server.ts`: key resolution remains `KIT_KEY || CIRCLE_KIT_KEY || NEXT_PUBLIC_KIT_KEY`.
- `src/sdk/appkit-client.ts`: browser App Kit initialization uses a keyless constructor; `getBrowserKitKey()` returns `null`; Circle requests are intended to use the same-origin server proxy.
- `src/app/api/circle/swap/prepare/route.ts`: the server route still accepts both Arc Testnet `5042002` and Arc Mainnet `5042`, even when the runtime default is Testnet. It is a prepare-only route, not a transaction broadcaster, but it can return transaction data intended for downstream signing. The route response currently uses the runtime default `ARC_CHAIN_ID` rather than the validated request `chainId`; confirm the integrated security stack contains the separately reviewed chain-ID consistency fix before any release.

### Public Preview bundle spot-check

Against the exact PR #46 Preview homepage, an ephemeral sandbox fetched and scanned all 17 JavaScript chunks directly referenced by that homepage. The scan emitted only boolean indicators and did not print any content or credential values.

- No `NEXT_PUBLIC_KIT_KEY`, `KIT_KEY`, `CIRCLE_API_KEY`, or `CIRCLE_KIT_KEY` identifier was found in those 17 homepage-referenced chunks.
- No string matching the expected `KIT_KEY:id:secret` shape was found in those chunks.

**Scope limitation:** this is a bounded Preview homepage-chunk scan, not a complete crawl of every route/chunk, a scan of every static asset, or a Production bundle verification. It does not prove the Production secret is safe or that no other client entry point can reference the variable. Keep the required full client-bundle and source-usage verification open. The `NEXT_PUBLIC_KIT_KEY` fallback should be removed once the owner confirms it is not required for compatibility and a server-only replacement is configured; do not change Production credentials without explicit approval.

### Release decision remains unchanged

No Mainnet request, live Circle quote, wallet signature, transaction broadcast, Production environment change, or secret decryption was performed. Do not use a Production key in Preview. Keep the Mainnet prepare gate and secret migration as explicit owner decisions. PR #46 remains Draft and no independent review submission was present at this check.