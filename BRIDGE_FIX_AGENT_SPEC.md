# AGFusion Bridge Fix Agent Spec

Target: current `master` branch at the time this spec was created.

## Goal

Fix the Circle App Kit bridge orchestration without rewriting the wallet, Circle Email Wallet, RPC proxy, CCTP configuration, or recovery architecture.

## Current findings

`src/blockchain/appkit-service.ts` currently does all of the following in the same bridge attempt:

- pre-switches the injected provider to the source chain;
- creates a source adapter and a second destination adapter;
- uses `targetChainId` on both adapters;
- installs a `kit.on("*")` listener that can switch to the destination chain;
- manually calls `wallet_switchEthereumChain` again immediately before `kit.bridge()`;
- requires a valid KIT_KEY before bridge execution;
- passes `{ config: { kitKey } }` into `kit.bridge()`;
- retries every `result.state === "error"` through `retryBridge()` without checking whether the error is retryable;
- treats the last step tx hash as the destination hash without requiring that the last step is actually the mint/receive step;
- can preserve partial SDK state, but recovery must remain the source of truth and must never re-burn.

## Required implementation

### 1. Keep one wallet provider and one App Kit adapter

For user-controlled wallets (EVM wallets and Circle Email Wallet), resolve the active provider once with `getInjectedProvider()` and create one `createAppKitAdapterFromBrowser()` adapter for the bridge attempt.

Do not create a separate destination adapter. Pass the same adapter object to both `from.adapter` and `to.adapter` in the App Kit bridge request.

Do not change the existing Agent/ZeroDev execution architecture unless required by compilation.

### 2. Remove competing chain-switch authorities

The bridge orchestration must have exactly one explicit source-chain switch before `kit.bridge()` when required by the connected wallet.

Do NOT also:

- switch on `kit.on("*")` when burn/mint events occur;
- manually switch again immediately before `kit.bridge()` if the preflight already verified the provider is on the source chain;
- rely on destination adapter `targetChainId` to switch the wallet independently.

The destination chain is part of the App Kit bridge operation. Do not manually switch the user wallet to the destination during the bridge lifecycle unless the SDK explicitly requires it and the SDK's documented flow cannot complete without it.

For Circle Email Wallet, do not fabricate or simulate network switching. Its provider must report/execute against the correct Circle wallet/chain through the existing Circle SDK path.

### 3. KIT_KEY must not be a bridge hard gate

`src/lib/kit-key.ts` and `formatKitError()` are still used elsewhere, so do NOT delete the import or helper functions globally.

For bridge specifically:

- remove the precondition that throws `Circle kit key missing for bridge`;
- do not pass `config: { kitKey }` to `kit.bridge()` unless the installed App Kit version's actual TypeScript/API contract requires it;
- if the installed SDK type requires a key, obtain it only as an optional configuration and preserve the SDK's normal behavior;
- do not break swap, where the project may legitimately need a Kit key.

Never remove `formatKitError`, `KIT_KEY_HELP`, or `ensureKitKey` from the module if they are used by other paths.

### 4. Retry only retryable bridge failures

Import/use the App Kit SDK's `isRetryableError` if the installed version exports it.

Behavior:

- `result.state !== "error"`: do not retry.
- `result.state === "error"` and `isRetryableError(error/result)` is true: use `retryBridge()` with the same adapter context.
- non-retryable errors: surface the original error and preserve partial state.
- user rejection, wrong chain, malformed parameters, unsupported chain, missing wallet, and invalid credentials must never be blindly retried.

Do not assume the SDK error object has an `error` property. Use the actual installed SDK TypeScript types or a safe type guard.

### 5. Destination success must be explicit

After `kit.bridge()` or `retryBridge()` returns, identify steps by semantic name/state.

A successful bridge requires:

1. source approval/burn completed as applicable;
2. attestation completed as applicable;
3. destination mint/receive step completed;
4. destination tx hash exists;
5. destination receipt is verified on-chain and is successful.

Do not use an arbitrary `lastHash` as the destination transaction hash.

If the SDK returns success but the destination mint/receive hash is missing, return a retryable/pending state, not success.

If the destination receipt is reverted, return error.

If receipt is not yet found, return retryable/pending and preserve the state. Never re-burn.

### 6. Preserve recovery safety

Do not rewrite `src/lib/bridge-state.ts` unless a specific compilation/invariant issue requires it.

The following must remain true:

- a confirmed burn cannot be executed again;
- source/destination chains, token, amount, and recipient are immutable for a recovery attempt;
- a destination-confirmed bridge cannot return to pending;
- a recovery attempt must verify the actual source burn and destination transaction on-chain;
- SDK success alone is never proof of blockchain settlement.

### 7. Do not change the working wallet adapters unnecessarily

Keep:

- EIP-6963 wallet discovery;
- active-wallet selection;
- Rabby/MetaMask/other EVM providers;
- Circle Email Wallet SDK authentication and challenge execution;
- existing Circle wallet ownership validation;
- existing RPC proxy/failover.

The objective is bridge orchestration, not a wallet rewrite.

### 8. RPC behavior

Keep the current `/api/rpc` proxy and its read failover.

Do not add blind write retries. A transaction write must not be sent twice because an RPC response was lost.

### 9. Error reporting

Do not replace useful Circle/App Kit error information with a generic `Network connection failed` message.

Preserve the root error through `formatKitError()` and add bridge-specific context only after the root error is known.

### 10. Tests

Add/update tests for:

- same adapter object used for source and destination;
- no destination lifecycle chain switch;
- bridge does not require KIT_KEY when the installed SDK does not require it;
- non-retryable error does not call `retryBridge()`;
- retryable error calls `retryBridge()` exactly once;
- destination mint/receive hash is required for success;
- destination receipt reverted => error;
- destination receipt missing => retryable/pending;
- Circle Email Wallet remains supported for Arc Testnet <-> Base Sepolia;
- EVM wallet bridge remains supported;
- no duplicate burn on recovery.

Then run:

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

Do not claim the bridge is fixed unless all three validation commands pass.

## Important safety rule

Do not replace the entire `src/blockchain/appkit-service.ts` with a generated rewrite. Make a surgical change against the current file. Preserve send, swap, estimates, recovery, transaction records, and other exports.

If the installed App Kit version's API differs from the assumptions above, inspect the installed package/types and adapt to the actual API instead of inventing fields.

## Final report

Return:

1. exact files changed;
2. exact bridge problems found;
3. exact changes made;
4. typecheck result;
5. test result;
6. build result;
7. whether Circle Email Wallet bridge path was preserved;
8. whether EVM wallet bridge path was preserved;
9. any remaining blocker;
10. exact manual live test to run after deployment.
