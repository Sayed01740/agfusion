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

- PR #43 replaces the empty ESLint placeholder with active core safety rules for JavaScript, CommonJS, and ES module files. It does not yet parse TypeScript/TSX application files or integrate the Next.js ESLint plugin. Do not describe this incremental baseline as complete application lint coverage.
- Four moderate development-tooling advisories remain: `minimatch <11.0.1` (GHSA-g3hv-75wg-m249) and its ESLint dependency chain (`eslint`, `@eslint/config-array`, `@eslint-community/eslint-utils`). Production audit remains at zero vulnerabilities; full-tree high/critical remains zero. npm's suggested forced remediation downgrades ESLint to 4.0.0, a breaking and inappropriate change; do not apply it blindly. Obtain a compatible upstream fix or review a carefully tested override.
- The Vercel build also reported a dynamic dependency import warning in the Viem/Ox Tempo dependency chain. It did not fail the build; assess whether it is benign or requires a bundling adjustment.
- No independent security reviewer has submitted an approval. The public Arc RPC trust boundary still requires explicit owner acceptance before any future payment-finality reliance.

### Current decision

The x402 payment challenge inconsistency is resolved in the latest Preview and all exact-head CI/audit/DB/Preview checks passed. The stack remains Draft and is **not approved for merge or Production deployment** until independent review, real lint coverage, tooling-advisory disposition, and the public RPC trust-boundary decision are complete.


## 11. Review-package CI completion

The documentation package was validated on its earlier head `36802685c7de66acd9a8a1654aa9ff0c492256e7` (CI run `41489838387`, run 931). It has since been updated again.

- Current PR #42 head: `0ffa192a468b93c539315421861686bec3833467`.
- GitHub CI run `41511664231` (run 939) completed successfully. Its `check` job (`125504751052`) completed successfully through clean install, TypeScript typecheck, tests, and production build.
- This validates the documentation branch's configured CI workflow only. It does not constitute independent security review, approval of the code PR stack, or authorization to merge/deploy.

The current release decision remains unchanged: keep all security PRs Draft, retain the global x402 shutdown, and do not merge or deploy Production until the independent review and remaining release blockers are resolved.


## 12. Incremental ESLint baseline PR

A separate Draft code PR was opened to replace the empty ESLint placeholder with active core safety rules:

- PR #43: https://github.com/Sayed01740/agfusion/pull/43
- Branch: `security/eslint-config-minimatch-remediation`
- Head: `276b2d965e8c7078a352b24044adccefb46e35e8`
- Parent: code PR #40 head `3aebdc6e15946bc73baa18e42f430467be82d1a2`

The configuration now actively checks JavaScript, CommonJS, and ES module tooling/configuration files for debugger statements, constant conditions, duplicate keys, unreachable code, invalid typeof checks, eval/new Function/implied eval, unsafe prototype method calls, and empty blocks (except empty catch blocks). It excludes generated output and dependencies. It adds no dependencies and does not alter the lockfile.

**Scope limitation:** This is an incremental baseline only. TypeScript and TSX application files are not yet parsed by ESLint. TypeScript typecheck and the existing test suite remain separate checks; they are not a substitute for TypeScript lint coverage. The Next.js-specific ESLint plugin warning may remain. Do not mark the overall lint release blocker fully resolved until TypeScript/TSX lint coverage and Next.js plugin integration are addressed.

Local validation on the exact parent code head under Node 22: clean `npm ci --legacy-peer-deps` followed by `npm run lint` completed successfully with the new rules. PR #43 exact-head GitHub CI and dependency audit subsequently completed successfully (Section 13). The separate moderate development-tooling audit finding is not fixed by PR #43.


## 13. PR #43 exact-head CI and dependency audit completion

PR #43 exact head `276b2d965e8c7078a352b24044adccefb46e35e8` completed both configured GitHub workflows:

- CI run `41493479608` (run 933): success. The configured sequence completed clean install, Circle SDK compatibility checks, Elliptic leading-zero regression, ESLint, TypeScript typecheck, Vitest, and production build.
- Dependency security audit run `41493479584` (run 219): success. Production dependency audit and full-tree high/critical gates passed. The development dependency report still lists the moderate minimatch advisory and its transitive ESLint chain (`minimatch`, `@eslint/config-array`, `@eslint-community/eslint-utils`, and `eslint`). The audit workflow's enforcement step was skipped because its preceding severity gates passed; this does not mean the moderate advisory is fixed.

PR #43 is still Draft and does not change the dependency graph. Its active lint scope is JavaScript/CommonJS/ESM only; TypeScript/TSX lint coverage and Next.js plugin integration remain outstanding. The build continues to report the existing Viem/Ox dynamic dependency import warning. No independent security review has been received, and no merge or Production deployment is authorized.


## 14. Candidate full TypeScript/TSX lint and minimatch remediation validation

A second disposable Node 22 sandbox test was run from PR #43's exact parent code head `276b2d965e8c7078a352b24044adccefb46e35e8`. This was a candidate experiment only; the resulting package/config/lock changes have **not** been committed to PR #43 or any other branch.

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

**Repository status:** PR #43 still contains only the earlier JavaScript/CommonJS/ESM lint baseline. The full TypeScript/TSX candidate and minimatch override are not yet committed, so neither the 0-vulnerability result nor the broader lint coverage is a repository/CI result. Before adopting it, transfer the candidate `package.json`, matching `package-lock.json`, and ESLint config together, then require exact-head GitHub CI, dependency audit, and Preview validation. No merge or Production approval follows from this sandbox test.


## 15. Requested-chain ID consistency finding: fix present in PR #40 code

GitHub issue #38 records a correctness finding in `src/app/api/circle/swap/prepare/route.ts`: the earlier implementation could label a prepared response using the runtime default chain ID rather than the validated request chain ID.

**Current code inspection on PR #40 branch `security/integrated-zod4-dependency-remediation`:**

- The route now returns the validated `chainId` in its successful response.
- The route tests include mocked App Kit cases for both Arc Testnet `5042002` and Arc Mainnet `5042`, and assert that the response `chainId` matches the request.
- These tests exercise quote preparation only. They do not sign or submit a transaction.

This indicates the reported mismatch is addressed in the inspected PR #40 branch. However, issue #38 remains open as a GitHub tracking item, and the fix must remain part of the exact reviewed stack. Confirm the same code and tests are present on the final integrated head, and ensure the reviewer includes this change in the positive-path swap-prepare review.

Issue: https://github.com/Sayed01740/agfusion/issues/38

Do not infer that the entire swap flow is approved from this targeted regression test. The test is separate from the x402 shutdown and does not authorize Mainnet activation or transaction execution.

## 16. Follow-up status: full lint candidate remains uncommitted

The full TypeScript/TSX lint and minimatch override candidate described in Section 14 was not transferred into the repository. The latest attempt to create a replacement Vercel sandbox through the v4 sandbox API returned HTTP 400 (`bad_request`). No candidate files were committed, and no lockfile or package manifest was partially updated.

Do not adopt only the package manifest or ESLint config without its matching lockfile. The candidate remains experimental until all three files can be transferred atomically and exact-head CI, audit, and Preview checks pass.


## 17. Focused code-review notes for Circle/Zod patch and Elliptic regression

A further source inspection was performed against PR #40's current branch. These are review prompts, not claims of a confirmed vulnerability or independent approval.

### Circle/Zod compatibility installer: `scripts/patch-circle-zod-compat.mjs`

Observed implementation characteristics:

- Recursively walks source-like files under `node_modules/@circle-fin`, skipping symlinks, then rewrites bare `zod` module specifiers to `zod/v3` using a regular expression.
- Patches the installed `node_modules/zod/v3/types.js` runtime by locating `class ZodArray`, `class ZodSet`, and specific source markers.
- Uses marker strings to avoid inserting the array/set guards more than once. If no imports are rewritten on a later run, it checks only that `@circle-fin/app-kit/index.mjs` exists and contains `zod/v3`.

Independent reviewer should specifically verify:

1. The regex rewrites only syntactic module specifiers and cannot alter comments, string literals, or unrelated package content. Check static imports, re-exports, CommonJS, dynamic imports, minified bundles, and package subpaths.
2. The fallback idempotence check is sufficient for every installed Circle package and every import form actually used at runtime. A single App Kit marker does not by itself prove all relevant package imports were rewritten.
3. The hard-coded Zod runtime path and source markers are version/layout guarded. Test the exact lockfile and fail-closed behavior when the upstream package structure changes.
4. The inserted array/set guards run after the appropriate size issue is recorded but before any element parser or refinement executes. Verify exact-limit, max-limit, min-limit, async, nested, and unbounded collection behavior.
5. Running the patch twice is a byte-for-byte no-op on the second run; running it after a clean install produces the same resulting package files.
6. Build/deployment always runs the patch before any Circle SDK module can be loaded, including non-build entry points or alternative deployment commands.
7. The production artifact actually contains the patched runtime and does not reinstall or restore unpatched dependencies later.

The current regression script `scripts/test-zod-v3-security.mjs` verifies that oversized bounded arrays and sets fail without visiting element refinements. Extend review to confirm error semantics and all supported Zod collection variants, not only the three demonstrated cases.

### Mapped Elliptic regression: `scripts/test-mapped-elliptic-leading-zero.mjs`

Observed test characteristics:

- Resolves the Elliptic copy nested under `@ethersproject/signing-key`, rather than assuming the top-level package is the runtime copy.
- Injects a controlled P-521 DRBG byte sequence with a leading zero, computes expected ECDSA values independently, and restores the patched DRBG method in a `finally` block.
- Also checks a P-256 RFC 6979 SHA-256 known-answer signature and verification.

Independent reviewer should still verify:

1. The exact `@mapped/elliptic@6.6.10` source diff against the upstream package and the published tarball/provenance.
2. The complete upstream Elliptic test suite against the attested source revision, not just these targeted vectors.
3. Nonce truncation/retry boundaries, supported curves, DER encoding, signature verification, and malformed-key behavior.
4. That the nested Elliptic implementation exercised by this test is the same implementation reached by each supported wallet/signing path in the application.
5. That the monkey-patched DRBG test is deterministic under the CI runtime and cannot leak altered global state into subsequent tests.

No code was changed as part of this source inspection. These notes do not substitute for an independent cryptographic review.
