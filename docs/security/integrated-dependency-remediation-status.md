# Integrated dependency remediation status

Date: 2026-11-02

## Scope

This branch integrates the dependency remediation from Draft PR #29 onto the hardened x402/request-body stack in Draft PR #39. It is an integration candidate only; it is not merged, deployed to Production, or approved for payment activation.

Base security-stack commit: `b54b3a3cc7b5c57804fafa9b3137ad899084e35c`

Dependency-remediation source commit: `85003aad50ce908d6be108b3eaedfb7403b5cc54`

## Resolved package versions

A fresh Node 22 / npm 10 install on the dependency-remediation source branch resolved:

- Next.js: `15.5.28`
- Zod: `4.6.7`
- Circle App Kit: `1.19.0`
- Circle Viem adapter: `1.19.3`
- Solana web3.js: `1.99.0`
- Elliptic dependency: `@mapped/elliptic@6.6.10`

The package lock also carries reviewed overrides for `undici`, `@grpc/grpc-js`, `toml`, `uuid`, `jayson`, `deepmerge-ts`, and the relevant `bn.js` paths.

## Fresh audit evidence

Using Node `v22.23.4` and npm `10.9.9` on the dependency-remediation source branch:

- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **4 moderate vulnerabilities**, all in development tooling: `eslint`, `@eslint-community/eslint-utils`, `@eslint/config-array`, and `minimatch`.
- No high or critical findings remained in that source branch.

The four moderate development advisories are not hidden. The audit workflow in this integration candidate enforces:
1. No moderate-or-higher production dependency advisories.
2. No high-or-critical advisory anywhere in the dependency tree.
3. Full dependency findings remain visible in CI output for review.

The current #39 stack before this integration had 50 production findings, including one critical Next.js advisory, because its lockfile still resolved Next.js `15.5.20` and Zod `3.25.76`. Do not apply PR #29's earlier audit result to that older stack.

## Compatibility and cryptographic checks

The exact dependency-branch CI sequence was re-run in an isolated Node 22 environment:

1. `npm run test:circle-sdk-compat`
2. `npm run test:elliptic-leading-zero`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

All commands passed when run in that order. The Circle compatibility patch must run before the full test suite; running `npm test` without it first reproduces a Zod API incompatibility in Circle App Kit initialization.

The published `@mapped/elliptic@6.6.10` tarball's `lib/elliptic/ec/index.js` matched the exact SLSA provenance source commit file byte-for-byte (SHA-256 `093125ed199d6c89cc61f5011d03d4c10a7122ba85b0c782da0cee79c5d9d75d`). The fork's full lint/test run passed 228 tests. This remains supporting evidence, not independent cryptographic approval.

## Integration status

The following still require fresh validation on this combined branch:

- CI and disposable PostgreSQL integration for the combined request-hardening + x402 + dependency changes.
- Vercel Preview build and read-only smoke tests on the combined head.
- Circle Testnet prepare-only quote with an authorized Preview-only Circle key.
- Independent review of the Circle Zod compatibility patch and the complete Elliptic fork diff.
- Independent reviewer approval of the x402 trust model and the dependency changes.

No production environment variables, database schemas, Mainnet settings, wallet signing, or blockchain transactions were changed.
