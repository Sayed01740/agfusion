# AGFusion final integration and release gate

**Prepared:** 2026-11-04  
**Repository:** `Sayed01740/agfusion`  
**Purpose:** Record the verified branch relationships, integration blockers, and release acceptance sequence.  
**Status:** Maintainer integration assessment only. Not an independent audit or release approval.

## 1. Exact-head evidence rechecked

### PR #42 documentation package
- Head: `5ae0e97f7bf2643569703651271c7310a735a2ab`
- GitHub Actions CI run: `41804131211`, completed successfully.
- The check job passed `npm ci --legacy-peer-deps`, TypeScript typecheck, Vitest, and production build.
- Vercel Preview deployment `dpl_A722Fo1BQJceNR53fQ9mBciAW2Eu` reached READY for the same commit.

### PR #46 RPC hardening
- Head: `30d6e9f159dc351f6349885531a09dc25d7235da`
- GitHub Actions CI run: `41800688483`, completed successfully.
- The check job passed clean install, typecheck, Vitest, and production build.
- Vercel Preview deployment `dpl_D8LBCiC4KBxx1xJ4k4zKFKsJUsGT` reached READY for the same commit.
- Direct read-only Preview smoke evidence is recorded in Section 23 of the independent review package.

### PR #40 dependency/security remediation
- Reviewed branch: `security/audit-remediation-zod4-elliptic`.
- The PR description records exact verified code head `3aebdc6e15946bc73baa18e42f430467be82d1a2`.
- The PR description records successful CI, dependency audit, disposable PostgreSQL integration, and Preview verification on that exact head.
- Four moderate development-tooling advisories were recorded on the PR #40 tree; PR #43's separate candidate later reported zero moderate-level audit findings on its own exact verification tree. Do not assume PR #43's lockfile is present on PR #40 or PR #46.

### PR #43 lint/dependency candidate
- Reviewed branch: `security/eslint-config-minimatch-remediation`.
- Exact verification head recorded in its PR description: `951ead919fa2ac0518a0cee0e39a4a829bdedf81`.
- PR description records CI, dependency audit, disposable PostgreSQL integration, and Preview success.
- ESLint reported 0 errors and 173 warnings across 201 files. These warnings remain visible cleanup debt.

## 2. Branch integration result

GitHub compare results establish the following:

1. `security/rpc-readonly-allowlist-batch-guard` is exactly 10 commits ahead of `security/reconciled-bounded-proxy-text-bodies` and 0 commits behind. PR #46 is a clean stack on PR #41.
2. `security/audit-remediation-zod4-elliptic` and `security/reconciled-bounded-proxy-text-bodies` are divergent. The comparison reports 30 commits on the request-body branch and 252 commits on the dependency branch since their merge base.
3. `security/eslint-config-minimatch-remediation` and `security/rpc-readonly-allowlist-batch-guard` are also divergent. The comparison reports 14 commits on the RPC branch and 139 commits on the ESLint/dependency branch since their merge base.
4. The PR #40, #41/#46, and #43 exact-head green checks therefore do not constitute a single integrated final-head check.

**Decision:** Do not blindly retarget or merge these branches. The dependency tree, x402 shutdown, request-body protections, RPC allowlist, lint configuration, and lockfile changes must be reconciled on a dedicated integration branch, with conflicts resolved and all tests rerun on that one exact commit.

## 3. Swap chain-ID consistency correction

The current PR #46 branch source has now been re-read:
- `src/app/api/circle/swap/prepare/route.ts` returns the validated request `chainId` in its successful response.
- `src/app/api/circle/swap/prepare/route.test.ts` includes regression cases for Arc Testnet `5042002` and Arc Mainnet `5042`, asserting that the response matches the requested chain.
- A follow-up evidence comment was added to Issue #38.

This resolves the code change on the PR #46 branch. Issue #38 remains open until the fix is present and re-verified on the integrated release head. The test is mocked and does not prove a live Circle quote or authorize signing/broadcast.

## 4. Required integration sequence

1. Preserve all existing branches and PRs as recovery references.
2. Create one integration branch from the agreed security-stack base.
3. Reconcile the PR #40 dependency/Circle compatibility and Elliptic changes with PR #41 request-body protections and PR #46 RPC hardening.
4. Reconcile PR #43 ESLint/minimatch changes against the same lockfile and package manifest; resolve rather than overwrite competing changes.
5. Verify x402 remains globally disabled on both Risk Oracle and Agent Service.
6. Decide and enforce the Testnet-only Preview Mainnet-prepare boundary. Do not silently enable Mainnet.
7. Remove the `NEXT_PUBLIC_KIT_KEY` fallback only after confirming server-only compatibility and owner-approved environment migration. Never print, decrypt, copy, or move Production secrets into Preview.
8. Run a repository-wide inventory of inbound JSON/text body parsing and supported wallet/provider RPC methods.
9. Run clean install, Circle/Zod compatibility checks, Elliptic provenance and regression checks, full lint, typecheck, full Vitest, production build, dependency audit, and disposable PostgreSQL integration on the exact integrated SHA.
10. Deploy that exact SHA to Preview and run read-only Arc Testnet health checks, x402-disabled checks, malformed/oversized request checks, and provider compatibility traces. Do not sign or broadcast.
11. Obtain independent security and cryptographic review against that exact integrated SHA. Resolve every finding and rerun the full suite after changes.
12. Only after owner approval and documented release gates may the team consider Production promotion. Mainnet activation, credential rotation, database migration, payment enablement, and real transactions require their own explicit authorization.

## 5. Open release blockers

- Independent security reviewer identity and approval are still absent. PR #42 and PR #46 review lists were empty at the latest check.
- The branch stack is not yet a single integrated commit.
- Circle Kit key source still contains a `NEXT_PUBLIC_KIT_KEY` fallback; the bounded Preview homepage-chunk scan is not a complete Production bundle audit.
- Testnet-only Preview must explicitly reject Mainnet preparation if that is the owner-approved policy.
- Public RPC trust/finality model and distributed rate-limit requirements need owner decisions.
- Elliptic fork provenance, full source diff, upstream test coverage, and runtime reachability require independent cryptographic review.
- Circle/Zod downstream compatibility patch requires independent review and exact integrated-head verification.
- x402 remains disabled pending payment-proof, replay, and operational review.
- PR #43's 173 lint warnings and the Vercel dynamic Viem/Ox dependency import warning remain visible cleanup/review debt.

## 6. Explicit safety boundary

This assessment does not authorize merging PRs, Production promotion, environment-variable changes, secret rotation, database migration, Mainnet activation, wallet signing, transaction broadcast, or x402 payment re-enablement. Keep the security PRs Draft until the integrated exact-head checks and independent review are complete.
