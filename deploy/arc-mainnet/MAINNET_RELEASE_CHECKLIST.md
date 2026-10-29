# Arc Mainnet release gate checklist

This checklist is a release control, not deployment authorization. Keep this branch isolated and keep the existing Testnet configuration unchanged.

## 1. Deployment identity and control

- [ ] Confirm the target is Arc Mainnet (chain ID 5042 / `0x13b2`) using an independently trusted RPC.
- [ ] Approve a dedicated deployer wallet and confirm its key is stored outside the repository and CI logs.
- [ ] Confirm the intended Registry owner is a reviewed multisig or other explicitly approved control address.
- [ ] Review constructor arguments and metadata URI for every contract before any transaction is signed.
- [ ] Record deployment transaction hashes and deployed addresses from the explorer and independently verify bytecode.
- [ ] Verify Registry `owner()`, `active()`, and `VERSION()` against the approved release record.
- [ ] Verify Escrow `arbitrator()`, `feeRecipient()`, `feeBps()`, and `VERSION()` against the approved release record.
- [ ] Verify Disperse `VERSION()` and deployed bytecode against the reviewed build.
- [ ] Run `npm run verify:arc-mainnet` with the verified addresses and independently approved expected settings. Save the output in the release record.

## 2. Contract and application validation

- [ ] All CI checks, application tests, production build, and Foundry contract tests pass on the exact release commit.
- [ ] Public agent and swap-preparation JSON endpoints enforce request-body byte limits before JSON parsing; keep the limits covered by tests.
- [ ] Production dependency security audit has no unresolved high-severity findings, or a separately documented risk acceptance is approved by the release owner and security reviewer.
- [ ] Independently review the exact bytecode/build and all privileged roles.
- [ ] Test ERC-20 deposits with exact receipt, fee-on-transfer rejection, refund failures, dispute settlement rollback/retry, and failed fee transfer handling.
- [ ] Confirm emergency pause/rollback, key rotation, monitoring, and incident-response owners.
- [ ] Confirm production database migrations and rollback strategy against a non-production copy first.
- [ ] Complete low-value canary tests for send, swap, bridge, escrow, agent spending, identity registration, x402, and transaction reconciliation.

## 3. Integrations and funds safety

- [ ] Re-verify Arc RPC, chain IDs, native USDC, Circle CCTP TokenMessengerV2, MessageTransmitterV2, and domains against official provider documentation and live bytecode.
- [ ] Verify all provider API credentials and callbacks in the isolated deployment without exposing secrets to browser bundles, logs, or this repository.
- [ ] Keep Mainnet swaps disabled until a verified quote provider and settlement contract are available.
- [ ] Do not enable any cross-chain route with an unverified source/destination domain or contract.
- [ ] Start with explicit low canary limits and monitoring; verify reconciliation before raising limits.

## 4. Explicit release authorization

- [ ] A human release owner has reviewed the release record, independent audit, addresses, expected settings, rollback plan, and canary limits.
- [ ] The release owner explicitly approves deployment and production configuration changes in a separate step.
- [ ] Keep PR #21 a Draft until all mandatory gates are complete and reviewed.
- [ ] Never merge, deploy, change production environment variables, or broadcast Mainnet transactions solely because CI is green.

## Current status

Automated application and Foundry checks pass on the latest isolated branch commit, but the production dependency audit currently fails. Mainnet is **not release-ready**. The expected addresses/settings remain intentionally blank until verified deployments exist. No Mainnet deployment or transaction is authorized by this checklist.

### Latest automated evidence

Reviewed against isolated branch commit `0170a1aa86a22d789ba03fd3860e388530c07cac`:

- [CI / application typecheck, tests, and production build](https://github.com/Sayed01740/agfusion/actions/runs/40859376425): **passed**; includes tests for the new bounded JSON reader.
- [Foundry contract checks and deployment-script compilation](https://github.com/Sayed01740/agfusion/actions/runs/40859376751): **passed**.
- [Production dependency security audit](https://github.com/Sayed01740/agfusion/actions/runs/40859376679): **failed**. `npm audit --omit=dev --audit-level=moderate` reports 23 findings (7 low, 16 high), including the Zod advisory GHSA-mrhx-c7xc-m3w5 in the Circle App Kit dependency tree. The automated `npm audit fix --force` recommendation would downgrade `@circle-fin/app-kit` to 1.0.0, a breaking change; this was not applied. Investigate a compatible upstream fix or a tested, narrowly scoped remediation before considering release.
- [Read-only preflight script validation](https://github.com/Sayed01740/agfusion/actions/runs/40019273475): success, including fail-closed tests for missing configuration, duplicate contract addresses, zero addresses, and invalid fee settings. This is script/test validation, not a live Mainnet RPC preflight.

These workflow results verify code and automated tests only. The live Mainnet contract verification has **not** been executed because the actual deployed Registry, Escrow, and Disperse addresses and independently approved expected owner/arbitrator/fee settings have not been supplied. Do not fill these values with guesses.

Additional hardening on this branch: `src/lib/read-limited-json.ts` enforces a byte ceiling while streaming request bodies, with unit tests for valid JSON, malformed JSON, declared oversize, and streamed oversize. The AI agent endpoint applies a 64 KiB limit and Circle swap preparation applies a 16 KiB limit before parsing. This is defense-in-depth; it does not remove the vulnerable nested Zod copies from the Circle SDK dependency tree.

### Dependency compatibility experiment (not merged)

A separate draft experiment, [PR #22](https://github.com/Sayed01740/agfusion/pull/22), replaced all Zod copies with Zod 4.6.7. `npm audit --omit=dev --audit-level=moderate` passed in that isolated experiment, and TypeScript typecheck passed after updating the `z.record` call. However, application tests then failed at Circle App Kit import time with `TypeError: z.function(...).returns is not a function`, confirming that the installed Circle App Kit bundle still relies on a Zod 3 API. The global override is therefore incompatible and must not be merged. PR #22 is being closed as a failed experiment; the release audit blocker remains open until a compatible upstream or narrowly scoped, fully tested fix is available.

Next step: obtain a compatible Circle SDK dependency fix or complete a reviewed, tested remediation for the remaining nested Zod advisories without forcing a breaking SDK downgrade, then rerun CI, Foundry checks, and the production audit. Separately, obtain the real deployment addresses and independently approved control settings before running the read-only live Mainnet preflight. Keep Mainnet swaps disabled, preserve Testnet configuration, and do not merge, deploy, change production variables, or broadcast transactions until all release gates and explicit human approval are complete.
