# Circle SDK / Zod 4 compatibility spike

**Status:** dependency-audit remediation candidate validated on an isolated Draft PR; not merged, production-deployed, or live-Testnet validated. Full npm audit is clean on the committed lockfile. Community-fork and custom compatibility-patch review remains required.

## Goal

Identify a vendor-supported Circle App Kit / adapter dependency set that removes the vulnerable nested Zod 3 copies without breaking Circle SDK runtime behavior. Arc Testnet behavior must remain unchanged, and Mainnet swap preparation must stay disabled until the security and live-integration gates pass.

## Findings (2026-10-29)

1. The current AGFusion lockfile resolves `@circle-fin/app-kit@1.19.0` and `@circle-fin/adapter-viem-v2@1.19.3`. Their declared Zod 3 dependency keeps nested Zod 3 copies in the install tree.
2. Circle's public `circle-bridge-kit-transfer` example uses a direct Zod 4 range, but its lockfile still contains Zod 3.25.67 nested under Circle adapter/provider packages. A root-level Zod 4 dependency is therefore not proof that the vulnerable transitive packages are gone.
3. The project previously tried a blanket Zod 4 override and encountered a runtime incompatibility with the Zod 3 API `z.function(...).returns`. Do not repeat this without a compatibility test.
4. `npm audit fix --force` proposes a breaking downgrade of App Kit and is not an acceptable remediation.
5. CI for commit `9adadab18f8c2e158479fb45a5445ba94b08d6ea` passed typecheck, tests, and production build, while the separate dependency audit still failed. The current invalid-amount tests and Mainnet gate are defense-in-depth, not dependency remediation.

## Safe experiment plan

1. Obtain a vendor-supported App Kit/adapter release (or explicit vendor guidance) that changes the relevant Zod dependency range. Do not infer compatibility from the root package's version alone.
2. In an isolated branch, update only the candidate dependency versions and lockfile. Do not touch the Testnet route behavior or Mainnet readiness gate.
3. Capture the full dependency tree and verify whether every vulnerable Zod 3 instance is actually removed or has an upstream-advised mitigation.
4. Run, in order: clean install, `npm ls zod elliptic ethers`, `npm audit --omit=dev` and full `npm audit`, typecheck, unit tests, production build, Circle SDK initialization, mocked quote tests, then a live Arc Testnet quote-preparation smoke test using dedicated Preview/Testnet credentials.
5. Review any remaining Ethers/Elliptic findings individually. Do not mark the audit clean by suppressing findings or using an unverified override.
6. Keep the experiment as Draft until all relevant checks pass. No production deployment, Mainnet transaction, or secret transfer is part of this work.

## Acceptance criteria

- Circle SDK initialization and swap quote preparation remain compatible.
- Arc Testnet regression suite and live smoke test pass.
- Vulnerable nested dependency findings are resolved or documented with an upstream-supported mitigation and security review.
- Full dependency audit result is recorded without suppressions.
- Mainnet swap remains disabled until separate Mainnet readiness review is complete.

## References

- Circle App Kit: https://www.npmjs.com/package/@circle-fin/app-kit
- Circle's public example lockfile: https://github.com/circlefin/circle-bridge-kit-transfer/blob/master/package-lock.json
- Zod advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- Elliptic advisory: https://github.com/advisories/GHSA-848j-6mx2-7j84


## Additional upstream integration check (2026-10-29)

- Circle's published integration guidance says App Kit `>=1.11.0` is relevant to browser compatibility/polyfill behavior. This is not a security guarantee and does not mean transitive Zod 3 copies are removed.
- Circle's App Kit FAQ says Swap is currently server-side only and requires a Kit Key; do not expose that key in browser code. Testnet smoke testing must use a dedicated Preview/Testnet configuration and must never copy Production secrets.
- Circle's FAQ lists Arc Testnet swap support for USDC, EURC, and cirBTC and notes liquidity is limited. The smoke test should verify that a supported pair is estimable before attempting any user-approved execution; the existing prepare-only smoke test does not sign or broadcast.
- Latest official ecosystem release notes surfaced during this review describe App Kit and adapter releases, but do not claim a Zod 4 migration or resolution of the cited Zod advisory. A release bump alone is not sufficient evidence.

References:
- Circle App Kit browser guidance: https://github.com/circlefin/skills/blob/master/plugins/circle/skills/swap-tokens/SKILL.md
- Circle App Kit FAQ (swap runtime and Testnet token support): https://community.arc.io/public/blogs/app-kit-faqs-2026-07-07
- Circle October release notes: https://community.arc.io/public/forum/boards/arc-announcements-and-updates-fki/posts/new-stablecoin-kits-releases-ttfwelhyb7


## Exact CI audit triage (run #182)

The failed audit job's JSON summary identifies the following package families. This is a triage record, not a claim that any issue has been fixed.

| Finding group | Evidence in CI report | Safe next action |
|---|---|---|
| Zod | High; range `<4.6.6`; 16 nested/root install locations across Circle App Kit, adapters, kits and providers | Determine whether vendor releases remove the nested Zod 3 instances; then run API compatibility tests and inspect the complete resolved tree |
| Elliptic | Low; `elliptic <=6.6.1`; no safe remediation demonstrated by this report | Trace the introducing dependency and check its upstream maintenance/advisory status; do not invent a patched version |
| Ethers v5 subpackages | Low findings in ABI, abstract-provider, abstract-signer, hash, signing-key and transactions | Trace which Circle packages require these versions and test any vendor-supported upgrade independently |
| Circle packages | High aggregate findings propagated through adapter, App Kit, borrow/bridge/earn/onramp kits and multiple providers | Do not assume every package-level finding is a distinct direct exploit; resolve the underlying dependency edges and rerun audit |

The audit's automatic fix suggestion is a semver-major downgrade of `@circle-fin/app-kit` to `1.0.0`; this is rejected as unsafe without a deliberate migration and compatibility review. Some transitive provider findings report a fix as available, but that alone does not prove the resulting graph is compatible with AGFusion. Test a candidate on an isolated branch before adopting it.

## Validation evidence boundary

- CI run #777 for the previous documentation-only commit passed typecheck, unit tests, and production build.
- Dependency audit run #182 failed at the enforcement step; the report totals 23 findings (7 low, 16 high).
- The audit log was inspected to capture package locations and suggested fixes. No dependency was changed in this step.
- The research branch's newest documentation commit still requires its own CI result; do not infer a run result from a previous commit.
- No live Circle Testnet call was performed and no Mainnet transaction was signed or broadcast.


## Remediation candidate results (2026-10-29)

The isolated branch `security/audit-remediation-zod4-elliptic` now carries a committed `package-lock.json` and the audit workflow checks that lockfile directly via `npm ci`—it no longer generates a replacement lockfile in CI.

- Candidate graph: `zod@4.6.7` pinned through the root dependency and override; transitive `elliptic` resolved to `@mapped/elliptic@6.6.10`, a community-maintained fork rather than an upstream `elliptic` release.
- Circle compatibility: the build script redirects Circle SDK imports to Zod's `zod/v3` compatibility export and applies a small build-time backport of early-rejection guards for bounded Zod v3 arrays and sets. This is an application-maintained compatibility patch, not a Circle-issued patch.
- Regression evidence: `npm run test:circle-sdk-compat` verifies Circle App Kit / adapter import and initialization plus that bounded arrays/sets reject over-limit inputs before element parsing.
- Verified latest run on the committed-lockfile path: CI run #793 passed `npm ci`, compatibility/security regression checks, typecheck, all 179 tests across 28 test files, and production build. Dependency audit run #198 passed `npm audit --audit-level=moderate` across production and development dependencies; `npm ci` also reported zero vulnerabilities.
- Live Circle Testnet smoke test remains unperformed because dedicated Preview/Testnet configuration is not available. The route tests currently use mocked estimator responses and are not live integration proof.
- Risk boundary: a zero-result npm audit establishes the reported dependency graph is clear according to the current npm advisory database; it does not certify a third-party fork or a custom parser patch independently. The Zod collection guards cover schemas with explicit upper bounds; unbounded schemas require separate input-size/issue-count controls where reachable.
- Mainnet swap remains disabled. No merge, production deployment, transaction signing, or broadcast has occurred.

### Follow-up before merge

1. Review the `@mapped/elliptic` fork source and provenance, preferably replace it with an upstream release or migrate the introducing dependency to a maintained crypto implementation if feasible.
2. Perform security review of `scripts/patch-circle-zod-compat.mjs`, including fail-closed behavior across package upgrades and bounded-collection tests.
3. Obtain dedicated Preview/Testnet credentials/configuration and run the documented prepare-only live smoke test without signing or broadcasting.
4. Keep this PR Draft until those reviews and integration checks are complete.

Audit evidence:
- CI run #793: https://github.com/Sayed01740/agfusion/actions/runs/40885989397
- Full dependency audit run #198: https://github.com/Sayed01740/agfusion/actions/runs/40885989387
- Draft remediation PR #29: https://github.com/Sayed01740/agfusion/pull/29

## Scope limitation identified during follow-up review (2026-11-04)

The custom build-time patch in `scripts/patch-circle-zod-compat.mjs` must not be
described as a complete mitigation for every Zod collection-validation path.

- It redirects Circle package imports from bare `zod` to the Zod 4 package's
  `zod/v3` compatibility export.
- It backports early-return checks only for explicitly bounded Zod v3 arrays
  (`.max()` / `.length()`) and sets (`.max()`).
- It does not add a global cap for issue accumulation in unbounded arrays,
  unbounded sets, maps, or other collection schemas.
- `scripts/test-zod-v3-security.mjs` tests oversized bounded arrays and sets
  using `z.any()` elements. It proves those bounded inputs are rejected before
  element parsing, but it does not exercise unbounded collections containing
  invalid elements or demonstrate a general issue-count ceiling.
- The current npm advisory describes resource exhaustion from array validation
  without a length constraint. Therefore the existing bounded-collection tests
  are useful regression evidence, but they are not proof that all reachable
  Zod v3 compatibility parsing paths are protected.

Before treating this patch as an accepted security remediation, an independent
review must inspect the actual Circle SDK schemas and every untrusted-data
validation path, establish whether unbounded collection schemas are reachable,
and either prove effective upstream/input-size bounds or implement and test an
appropriate bounded issue-accumulation strategy. Do not add a blanket parser
rewrite or claim complete remediation without that review.

No production code or dependency versions were changed as part of this
follow-up. The current compatibility patch remains an unmerged review
candidate; no live Circle Testnet quote was performed.

## Exact Zod compatibility runtime review (2026-11-04)

The current PR branch lockfile contains one resolved Zod package:
`zod@4.6.7` at `node_modules/zod`. The Circle import rewrite directs Circle
packages to that package's `zod/v3` compatibility export; it does not load a
separate nested Zod 3 package in the current lockfile.

A source comparison against upstream tag `colinhacks/zod@v4.6.7` established
an important compatibility distinction:

- Zod 4's native parser includes the upstream early size-cap wrapper for
  arrays, sets, and maps (introduced by upstream PR #6652 and released in
  4.6.6).
- The same release's `packages/zod/src/v3/types.ts` compatibility parser still
  walks array elements after recording `.max()` / `.length()` issues, and
  walks set elements after recording `.max()` issues. The custom AGFusion build
  patch backports early rejection for these two bounded Zod v3 cases.
- Zod v3's `ZodMap` has no `.max()`, `.size()`, or equivalent container-size
  bound API in this compatibility source. Its map parser eagerly walks all
  entries. The current custom patch does not alter map parsing.
- Neither the upstream Zod 4 change nor the AGFusion compatibility patch places
  a universal issue-count ceiling on unbounded containers. A schema with no
  upper bound still walks its supplied elements/entries. This behavior must be
  evaluated together with the source and size limits of the data entering each
  schema, rather than described as a complete parser-level DoS fix.

The GitHub Advisory Database currently lists Zod versions below 4.6.6 as
affected by GHSA-mrhx-c7xc-m3w5 and identifies 4.6.6 as the patched release.
The CNA's CVE-2023-54404 record has subsequently been marked rejected; do not
present that CVE identifier as an active CVE. Upstream PR #6652 explicitly
states that unbounded containers are unchanged and that its fix moves declared
size checks ahead of element parsing. These facts are not contradictory to the
AGFusion compatibility concern: Circle is routed through Zod's v3 API inside
the patched 4.6.7 package, and that v3 compatibility parser does not contain
the corresponding early-rejection logic.

Current bounded-array/set regression tests demonstrate the AGFusion backport
works for those bounded cases. They do not establish that all Circle schemas
are bounded, nor that map or unbounded validation paths are protected. The
remaining review task is therefore to inventory actual Circle SDK schemas and
the provenance/maximum size of their inputs, then add explicit bounds at the
application boundary wherever untrusted collections are accepted. Do not
invent a blanket parser rewrite or claim full remediation without that work.

References:
- Zod 4.6.7 release and upstream PR #6652:
  https://github.com/colinhacks/zod/releases
  https://github.com/colinhacks/zod/pull/6652
- Zod 4.6.7 v3 compatibility source:
  https://github.com/colinhacks/zod/blob/v4.6.7/packages/zod/src/v3/types.ts
- Zod advisory:
  https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Application-boundary and lockfile inventory (2026-11-04)

A second pass parsed the complete lockfile package map rather than grepping only
top-level dependency declarations:

- There is exactly one physical Zod installation in this lockfile:
  `node_modules/zod@4.6.7`. No nested `node_modules/**/zod` package is
  present.
- Circle packages declare a Zod dependency at `3.25.67` in their package
  metadata, including App Kit `1.19.0`, Viem adapter `1.19.3`, Bridge Kit
  `1.16.1`, Swap Kit `1.8.2`, Unified Balance Kit `1.9.0`, and their
  listed provider packages. The root `overrides.zod = 4.6.7` plus the
  lockfile's single physical installation means those packages resolve the
  root Zod 4 package; their rewritten `zod/v3` specifiers select its v3
  compatibility API. This is not a second, nested Zod 3 runtime.
- The application itself imports `zod/v3` in `src/lib/validation.ts`.
- `POST /api/circle/swap/prepare` reads a streaming request body with an
  8 KiB hard cap before JSON.parse, rejects non-object JSON, validates the
  wallet address, limits amount text to 80 characters and six decimal places,
  restricts token pairs, and accepts only Arc Mainnet 5042 or Arc Testnet
  5042002. It still intentionally supports Mainnet unsigned quote preparation;
  it does not sign or broadcast.
- `POST /api/transactions` reads a streaming body with a 16 KiB hard cap
  before Zod validation. The schema includes an unbounded `stepsJson` string
  field, but the complete request is capped at 16 KiB before parsing. The
  current handler then JSON.parse's that field. Keep this in the input-boundary
  inventory; consider a smaller field-specific cap and JSON-shape validation
  in a separate reviewed change.
- `readLimitedJson` counts actual streamed bytes and does not rely on
  Content-Length, so missing or inaccurate headers do not bypass these two
  request limits.

This narrows the application-controlled request exposure for the inspected
Circle swap and transaction-persistence endpoints. It does **not** establish
that every Circle SDK internal schema or every Circle network response is
bounded. The installed SDK tarball source was not fully inventoried in this
pass, and there is no evidence here that all SDK collection schemas are
bounded. The remaining task is to inspect the exact installed package source
and its response parsing paths, or obtain Circle vendor confirmation, before
making a broader claim.

The Zod size-cap behavior is defensive hardening, not a claim of a confirmed
remotely exploitable AGFusion vulnerability. GHSA-mrhx-c7xc-m3w5 remains a
GitHub advisory listing versions below 4.6.6 as affected; the associated
CVE-2023-54404 record was rejected by its CNA on 2026-10-28. The rejection
reason specifically notes that JSON.parse has already allocated the input and
that an application request-size limit is relevant. The upstream 4.6.6 change
only moves declared `.max()`, `.length()`, and `.size()` checks before
element parsing; it does not cap unbounded containers. AGFusion's local v3
patch likewise does not create a universal issue-count cap.

References:
- GitHub Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- CNA CVE rejection record: https://app.opencve.io/cve/CVE-2023-54404
- Upstream Zod PR #6652: https://github.com/colinhacks/zod/pull/6652
- Zod versioned subpath documentation:
  https://github.com/colinhacks/zod/issues/4371

