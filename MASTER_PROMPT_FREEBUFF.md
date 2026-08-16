# AGFusion — Master Prompt for Local Freebuff Agent

## Mission

You are working inside the user's LOCAL AGFusion project. Your job is to take the current local code, compare it against the GitHub bridge-fix specification, implement the remaining bridge fixes safely, validate everything, and push only validated changes back to GitHub.

Repository: `Sayed01740/agfusion`

Reference branch: `bridge-fix-agent-spec`
Reference document: `BRIDGE_FIX_AGENT_SPEC.md`

Do not assume the GitHub branch contains the final implementation. It contains the implementation contract and the findings that must be applied to the local project.

---

## 0. Non-negotiable safety rules

- Work in the LOCAL project first.
- Never destroy or overwrite unrelated local changes.
- Before editing, inspect `git status`, current branch, recent commits, package version, and the actual installed Circle App Kit types.
- Never rewrite the entire project.
- Never rewrite `src/blockchain/appkit-service.ts` from scratch.
- Do not replace working Circle Email Wallet, EVM wallet, RPC, swap, send, recovery, or transaction-history architecture just to fix bridge.
- Do not use speculative APIs. Inspect the installed package and TypeScript definitions first.
- Never use `any`, `@ts-ignore`, or `@ts-expect-error` to hide a bridge typing problem unless there is a proven SDK typing limitation and it is documented.
- Never expose, print, commit, or upload secrets, private keys, Circle secrets, `.env` contents, wallet credentials, or session credentials.
- Never push directly to `master`.
- Never claim the bridge is fixed without automated validation and a real browser bridge test.
- If a test fails, diagnose the exact layer instead of masking the failure.

---

## 1. Read the GitHub specification first

Fetch the latest `bridge-fix-agent-spec` branch and read:

`BRIDGE_FIX_AGENT_SPEC.md`

Also inspect the current GitHub `master` and the local worktree. The local project is authoritative for implementation because it may contain newer changes.

Create a local implementation checklist from the specification before editing.

---

## 2. Inspect the actual local implementation

Inspect at minimum:

- `src/blockchain/appkit-service.ts`
- `src/sdk/wallet-adapter.ts`
- `src/sdk/circle-pw.ts`
- `src/sdk/appkit-client.ts`
- `src/lib/kit-key.ts`
- `src/lib/bridge-state.ts`
- `src/lib/cctp-chains.ts`
- `src/lib/tx-verify.ts`
- `/api/rpc` implementation
- package.json
- lockfile
- existing bridge tests
- existing wallet tests

Search the whole repository for:

- `kit.bridge`
- `retryBridge`
- `isRetryableError`
- `createAppKitAdapterFromBrowser`
- `targetChainId`
- `wallet_switchEthereumChain`
- `KIT_KEY`
- `formatKitError`
- `bridgeResult`
- `bridgeState`
- `mint`
- `receive`
- `burn`

Do not modify anything until this inspection is complete.

---

## 3. Determine the actual SDK contract

Inspect the installed `@circle-fin/app-kit` version and its TypeScript declarations.

Determine exactly:

- the type of `kit.bridge()`
- the bridge parameter shape
- adapter requirements
- bridge result shape
- step result shape
- retryBridge signature
- whether `isRetryableError` exists and what argument it accepts
- whether KIT_KEY is required for bridge in this installed version
- how Circle Email Wallet adapters are expected to work

If the GitHub specification assumes an API that does not exist in the installed version, adapt the implementation to the actual installed API and document the deviation.

Never invent an SDK field or function.

---

## 4. Fix bridge orchestration surgically

### Required architecture

For user-controlled EVM wallets and Circle Email Wallet:

1. resolve the active wallet/provider once;
2. create one App Kit adapter for the bridge attempt;
3. use that same adapter for the bridge source and destination configuration when the installed SDK requires adapter fields;
4. avoid creating independent source and destination adapters that race the same provider.

Preserve the Agent/ZeroDev path unless the installed SDK requires a minimal compatibility adjustment.

### Chain switching

There must not be competing chain-switch authorities.

Do not combine:

- pre-switch
- lifecycle destination switch
- immediate pre-bridge switch
- destination adapter switch

into one bridge attempt.

Use the minimum chain-switch behavior required by the actual SDK and wallet provider.

For normal EVM wallets, verify the source chain before execution.

For Circle Email Wallet, preserve its existing Circle SDK execution model and do not fake browser-network switching.

Do not manually switch the user wallet to the destination during the bridge lifecycle unless the installed SDK explicitly requires it and there is no supported alternative.

---

## 5. KIT_KEY

Do not delete `src/lib/kit-key.ts`.

Do not delete helpers such as:

- `ensureKitKey`
- `normalizeKitKey`
- `formatKitError`
- `KIT_KEY_HELP`

because other features may use them.

For bridge:

- remove the bridge-only hard failure caused solely by missing KIT_KEY if the installed SDK does not require it;
- do not pass a fake or unnecessary `config.kitKey`;
- if the installed SDK genuinely requires a key, use the correct project mechanism and document it;
- do not break swap or other legitimate Kit-key usage.

Never expose the actual key in logs.

---

## 6. Retry logic

Never retry every `result.state === "error"`.

Inspect the actual SDK error/result types.

Retry only when the installed SDK confirms the failure is retryable.

Rules:

- user rejected -> no retry
- unsupported chain -> no retry
- wrong chain -> no blind retry
- invalid parameters -> no retry
- missing wallet -> no retry
- authentication/credential failure -> no retry
- confirmed on-chain failure -> no blind retry
- retryable SDK failure -> retry at most once using the same bridge context

If the SDK exports `isRetryableError`, use it according to its actual type contract.

Do not assume `error` exists on a step/result object. Use the actual type or a safe type guard.

---

## 7. Destination success verification

A bridge is NOT successful merely because `kit.bridge()` returned without throwing.

A successful bridge must have:

1. source execution completed;
2. burn completed when applicable;
3. attestation completed when applicable;
4. destination mint/receive completed;
5. destination transaction hash identified from the actual destination step;
6. destination receipt verified on-chain;
7. destination receipt successful.

Do not use an arbitrary final/last transaction hash as the destination hash.

If destination hash is missing:

`retryable/pending`, not success.

If destination receipt is not found yet:

`retryable/pending`, not success.

If destination receipt reverted:

`error`.

If destination receipt succeeds:

`success`.

Never re-burn during destination recovery.

---

## 8. Recovery invariants

Preserve the existing bridge state machine.

A recovery attempt must not change:

- amount
- token
- source chain
- destination chain
- recipient

A confirmed source burn must never be repeated.

A confirmed destination mint must never be treated as pending.

On-chain evidence must take priority over UI state.

---

## 9. Wallet compatibility

Do not rewrite wallet discovery.

Preserve:

- EIP-6963
- active provider selection
- Rabby
- MetaMask
- Coinbase
- OKX
- Brave
- Trust
- Phantom
- Circle Email Wallet
- Agent/Smart Account path

The bridge fix must not cause a wallet-selection regression.

---

## 10. RPC safety

Keep the existing `/api/rpc` architecture.

Read failover is acceptable.

Never blindly retry a transaction write after an ambiguous network response.

A lost RPC response does not prove that the transaction was not submitted.

---

## 11. Error reporting

Preserve the original Circle/App Kit error.

Use `formatKitError()` where appropriate.

Do not turn every error into `Network connection failed`.

The final UI error should identify the actual failing layer where possible:

- wallet rejection
- wrong network
- insufficient balance
- RPC
- Circle authentication
- App Kit bridge
- attestation
- destination mint
- receipt verification

---

## 12. Tests

Create or update tests for:

1. same adapter is used for bridge source/destination when required;
2. no competing destination lifecycle switch;
3. bridge does not unnecessarily require KIT_KEY;
4. legitimate KIT_KEY usage elsewhere remains intact;
5. non-retryable bridge error does not call retryBridge;
6. retryable bridge error calls retryBridge once;
7. user rejection never retries;
8. destination mint/receive hash is required;
9. missing destination receipt becomes retryable/pending;
10. reverted destination receipt becomes error;
11. successful destination receipt becomes success;
12. recovery does not re-burn;
13. Circle Email Wallet Arc -> Base remains supported;
14. Circle Email Wallet Base -> Arc remains supported;
15. EVM wallet Arc -> Base remains supported;
16. EVM wallet Base -> Arc remains supported;
17. send remains functional;
18. swap remains functional;
19. wallet connect/disconnect remains functional;
20. type safety remains clean.

---

## 13. Validation

Run exactly:

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

If the repository uses different scripts, inspect `package.json` and use the equivalent existing commands. Do not invent a new build system.

All applicable validation must pass.

Do not call a test `passed` if it was skipped.

---

## 14. Browser/live verification

After automated validation, run the local app and test the actual UI.

Minimum bridge tests:

### Circle Email Wallet

- Arc Testnet -> Base Sepolia
- Base Sepolia -> Arc Testnet

### EVM wallet

- Arc Testnet -> Base Sepolia
- Base Sepolia -> Arc Testnet

Use a tiny test amount.

For every test record:

- wallet type
- source chain
- destination chain
- amount
- bridge step sequence
- source tx hash
- destination tx hash
- source receipt status
- destination receipt status
- final AGFusion status

If live testing is impossible because credentials/faucets/network access are unavailable, do not claim verification. Report the exact blocker.

---

## 15. Git workflow

Before editing:

```bash
git status --short
git branch --show-current
git log -5 --oneline
```

Do not destroy uncommitted local work.

Create a dedicated branch:

`bridge-fix-final-local`

After implementation and validation:

```bash
git diff --check
git status
```

Commit only relevant files.

Push to GitHub as a dedicated branch, preferably:

`bridge-fix-final-local`

Do NOT push directly to `master`.

Create a PR into `master` only after validation passes.

Do not merge the PR automatically.

---

## 16. Final report format

Return a concise but complete report with:

### Root cause

What was actually broken and why.

### Files changed

Exact paths.

### Architecture

What changed in bridge orchestration.

### Wallets

Circle Email Wallet status.
EVM wallet status.
Agent wallet status.

### Retry

How retry is now decided.

### Recovery

How duplicate burn is prevented.

### Destination verification

How destination mint/receipt is verified.

### Validation

Typecheck: PASS/FAIL
Tests: PASS/FAIL
Build: PASS/FAIL

### Live test

List each actual bridge test and its result.

### GitHub

Branch name.
Commit SHA.
PR number if created.

### Remaining blockers

Only real blockers. No speculation.

---

## Final rule

Do not optimize for saying "fixed".

Optimize for producing a bridge implementation that is actually correct, type-safe, recoverable, wallet-compatible, and verified on-chain.

If evidence contradicts the plan, stop, inspect the actual code/SDK, and adapt the implementation based on evidence.
