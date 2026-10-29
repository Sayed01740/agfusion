# Elliptic dependency reachability and cryptographic review notes

**Status:** Preliminary maintainer investigation; not an independent cryptographic audit.  
**Branch:** `security/audit-remediation-zod4-elliptic`  
**Related:** PR #29, security review issue #30.

## 1. Lockfile reachability

The committed `package-lock.json` contains this dependency path:

```text
@circle-fin/app-kit (and @circle-fin/adapter-viem-v2)
  -> @ethersproject/abi
  -> @ethersproject/hash
  -> @ethersproject/abstract-signer
  -> @ethersproject/abstract-provider
  -> @ethersproject/transactions
  -> @ethersproject/signing-key@5.8.0
  -> elliptic@6.6.1 (requested range)
  -> @mapped/elliptic@6.6.10 (locked package)
```

The concrete nested lockfile entry is `node_modules/@ethersproject/signing-key/node_modules/elliptic`, resolved to `https://registry.npmjs.org/@mapped/elliptic/-/elliptic-6.6.10.tgz`. The override intentionally supplies the mapped fork for the dependency that requests elliptic 6.6.1.

The reverse dependency graph also shows App Kit subpackages/providers (including bridge, swap, unified balance, CCTP and related providers) in this dependency family. This is evidence of **transitive dependency inclusion**, not proof that every operation invokes the signing implementation at runtime.

## 2. Application call paths reviewed

Source inspection identified user-confirmed flows that delegate to signing-capable SDKs:

- `src/components/ai/chat-panel.tsx` dispatches a confirmed preview to `executeSend`, `executeSwap`, or `executeBridge`.
- `src/lib/client-actions.ts` routes these to App Kit/viem send flows, the production swap flow, or bridge execution.
- `src/lib/erc8004.ts` uses viem's `createWalletClient` with a custom injected provider and `writeContract`.

These paths are user-influenced (e.g. amount, recipient, selected action) but ordinarily delegate key custody/signing to the selected wallet/provider or SDK. The source trace alone does **not** prove the nested `@ethersproject/signing-key` implementation is called for every wallet mode. Treat runtime reachability as unresolved until demonstrated by bundle inspection or targeted instrumentation against supported wallet modes.

## 3. Fork change and regression evidence

The mapped fork's `lib/elliptic/ec/index.js` passes the raw HMAC-DRBG byte array to `_truncateToN` in the default nonce path, so the array's byte length (including a leading zero) is preserved for bit-length truncation. The `options.k` override path remains separate.

AGFusion adds `scripts/test-mapped-elliptic-leading-zero.mjs`, which resolves the actual nested module from `@ethersproject/signing-key`, injects a controlled P-521 DRBG output beginning with a zero byte, independently calculates expected ECDSA `r` and `s`, checks both values and verifies the resulting signature. This test passed in CI run #803.

The test is targeted regression evidence only. It does not establish full cryptographic correctness, side-channel resistance, or the correctness of all curves and edge cases.

## 4. Required before merge or production use

- Independent cryptographic review of the complete mapped fork diff and the exact published tarball.
- Run/verify the fork's full upstream test suite against the exact attested source revision, including RFC 6979 known-answer vectors and all supported curves.
- Add or review edge cases for raw DRBG outputs with leading zeros, boundary values, rejected nonces and retry behavior.
- Establish runtime reachability with bundle/runtime tracing or targeted instrumentation for each supported signing path; document which paths execute this package and which do not.
- Complete a dedicated Arc Testnet Preview smoke test with non-production configuration and no production secrets.
- Keep PR #29 Draft until these items are independently reviewed. Do not treat a clean `npm audit`, provenance attestation, or a green build as sufficient cryptographic approval.

## 5. Safety boundary

No production secrets should be copied into Preview. Do not merge, deploy, enable Mainnet swap, or change existing Arc Testnet behavior based solely on this investigation.
