# Independent cryptographic and dependency security review packet

Status: **review required; not approved for merge or release**

This packet collects the exact scope and existing evidence for an independent reviewer. It is not itself an audit, approval, or assurance that the code is safe.

## Review targets

- Remediation PR: https://github.com/Sayed01740/agfusion/pull/29
- Tracking issue: https://github.com/Sayed01740/agfusion/issues/30
- Reviewed AGFusion branch head at packet creation: `85003aad50ce908d6be108b3eaedfb7403b5cc54`
- Locked replacement package: `@mapped/elliptic@6.6.10`
- Provenance source commit recorded by the workflow: https://github.com/mapped/elliptic/commit/309007dac6091b51cb68e6b71a633e169be47a87
- Upstream advisory: https://github.com/advisories/GHSA-848j-6mx2-7j84
- Upstream proposed fix and discussion: https://github.com/indutny/elliptic/pull/345
- Fork source: https://github.com/mapped/elliptic

## What changed

The branch updates the dependency tree to patched Next.js and Zod versions, moves Circle SDK consumers to the Zod 3 compatibility export provided by Zod 4, adds bounded array/set parsing guards to the installed Zod v3 runtime, and overrides the vulnerable transitive `elliptic` dependency with the community fork.

The fork change is security-sensitive cryptographic code. A dependency audit or a passing test suite does not establish that the fork is equivalent to a safe upstream implementation.

## Evidence already recorded

- The exact locked tarball URL and SHA-512 integrity were checked against npm registry metadata.
- The package provenance attestation subject digest was recorded as matching the lockfile tarball digest, with source commit `309007dac6091b51cb68e6b71a633e169be47a87`.
- The regression script injects leading-zero bytes at the HMAC-DRBG output boundary for P-521, verifies the resulting ECDSA `r` and `s` against an independently calculated expected result, and verifies the signature.
- The same script checks the P-256 / SHA-256 RFC 6979 known-answer `r` and `s` values and verifies the signature.
- CI at the documented head passed Circle SDK compatibility, the elliptic regression, lint, typecheck, the Vitest suite, and production build.
- The documented dependency audit reported zero production vulnerabilities and four moderate development-only findings. Those development findings were reported, not suppressed.
- No independent reviewer approval is currently recorded. The PR must remain Draft.

## Required independent review

The reviewer should be qualified in ECDSA implementation/security and JavaScript package supply-chain review. Please review the exact locked tarball and source commit, not only the current fork branch.

1. **Package provenance and reproducibility**
   - Verify the npm provenance attestation signature and subject digest independently.
   - Confirm the attested repository, commit, workflow identity, release workflow, and correspondence between the reviewed source tree and the published tarball.
   - Inspect all published files, package metadata, install scripts, generated files, and dependency changes in the tarball.
   - Verify repository ownership, maintainer controls, and release permissions.

2. **ECDSA implementation**
   - Diff the complete fork against upstream `elliptic@6.6.1`, including generated and bundled files.
   - Review nonce generation, truncation, bit-length handling, rejection sampling, RFC 6979 behavior, low-S normalization, and all supported curves.
   - Confirm the raw DRBG byte-array path preserves leading-zero length before integer conversion.
   - Independently validate the P-521 injected raw-byte vector and P-256 RFC 6979 vector; add edge cases as needed.
   - Review error handling and any changes outside the intended nonce fix.

3. **Runtime reachability**
   - Trace every production call path from AGFusion and its dependencies into `@ethersproject/signing-key` and the resolved `elliptic` implementation.
   - Identify which code can invoke ECDSA signing, the signer types and curves involved, and whether attacker-controlled or externally influenced inputs can reach those paths.
   - Do not infer that a path is unreachable from the fact that the current Preview smoke tests are estimate-only.

4. **Circle / Zod compatibility patch**
   - Review `scripts/patch-circle-zod-compat.mjs` and the exact Zod 4 `zod/v3` runtime it modifies.
   - Verify the import rewrite is bounded to intended Circle package files and behaves safely on clean/repeated installs.
   - Verify array/set early-return guards preserve Zod v3 issue semantics, async parsing, exact/min/max constraints, and nested schema behavior.
   - Check for schemas without explicit upper bounds and assess resource-exhaustion exposure at each affected route.

5. **Release integration**
   - Confirm the D1 quote-session Worker stores only token digests and enforces one-time consumption, wallet binding, chain ID 5042, bounded expiry, and fail-closed storage behavior.
   - Review the actual Mainnet quote/session preparation path separately from Circle Testnet estimate-only tests.
   - Confirm Mainnet signing, transaction submission, and broadcast remain disabled until their separate design and security gates are approved.

## Reviewer report requested

Please record:
- exact PR head SHA and package tarball digest reviewed;
- source-to-tarball provenance conclusion;
- cryptographic findings with file/line references and severity;
- runtime signing reachability conclusion and evidence;
- Zod compatibility findings;
- tests independently run and their environment;
- unresolved risks and required remediation;
- explicit `APPROVE`, `REQUEST_CHANGES`, or `COMMENT` review outcome.

## Safety boundary

Until a qualified independent reviewer has completed the above and submitted a review on PR #29:

- keep PR #29 and dependent PR #58 Draft;
- do not merge or promote to Production;
- do not enable Mainnet swap preparation;
- do not add Production secrets to Preview;
- do not perform wallet signing or transaction broadcast.

A green CI run, a zero-vulnerability production audit, a matching package digest, and a provenance attestation are useful evidence, but none is a substitute for independent cryptographic review.
