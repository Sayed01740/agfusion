# Circle SDK / Zod 4 compatibility spike

**Status:** investigation only; no dependency changes proposed.

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
