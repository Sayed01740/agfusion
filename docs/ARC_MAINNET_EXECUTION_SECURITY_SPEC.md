# Arc Mainnet Swap Execution Security Specification

**Status:** Design-only. Mainnet swap execution remains disabled.
**Scope:** Future wallet-confirmed Arc Mainnet swaps through a separately verified DEX adapter or an authorized Circle StableFX integration.
**Non-goal:** This document does not authorize deployment, enable a feature flag, sign transactions, or broadcast transactions.

## 1. Current execution boundary

- The Mainnet quote proxy is quote-only. It returns a normalized summary and never returns calldata, approval transactions, Permit2 payloads, or signing material.
- The browser UI may display a Mainnet quote, but its Swap action remains disabled.
- `runProductionSwap()` is restricted to the exact `Arc_Testnet` chain before wallet-provider access. The current ApexiSwap router, token registry, spender, and receipt-verification path are Testnet-only.
- The Circle App Kit preparation endpoint rejects Mainnet. An estimate is not unsigned transaction data.
- No Mainnet execution code may reuse Testnet router addresses, token metadata, RPC fallback lists, chain keys, or approval assumptions.

Any change that relaxes one of these boundaries requires a separate security review and explicit release approval.

## 2. Adapter separation

Implement Mainnet execution as a new adapter with its own typed interface. Do not add Mainnet branches to the existing Testnet transaction builder.

Suggested stages:

1. `getQuote()`: obtain a fresh quote from the selected, approved integration.
2. `validateQuote()`: validate chain, wallet, token addresses, exact input, recipient, output, minimum output, route, spender, and expiry.
3. `buildApproval()`: produce a narrowly scoped approval only when required. Prefer exact-amount approval; do not default to unlimited allowance.
4. `simulate()`: run all required simulations and balance checks. A failed or unavailable simulation is a hard stop for Mainnet.
5. `presentConfirmation()`: show the exact network, pair, input, minimum received, slippage, fees, spender/router, and quote expiry.
6. `submit()`: request a wallet signature only after explicit user confirmation.
7. `verifyReceipt()`: verify the transaction receipt and emitted token-transfer/swap effects on Arc Mainnet, not merely the transaction status.

The adapter must not silently fall back between Uniswap and StableFX, or between Mainnet and Testnet.

## 3. Mandatory chain and wallet binding

Immediately before every approval or swap request:

- Read `eth_chainId` from the active wallet provider and require exactly `0x13b2` (5042).
- Read `eth_accounts` and require the active account to equal the wallet address bound into the quote.
- Re-check chain and account after any wallet network-switch interaction.
- Reject unknown chain aliases. Never infer Mainnet from a build-time flag or a UI label.
- Bind the quote to the wallet, chain ID, token-in address, token-out address, exact input base units, recipient, slippage, and quote/request identifier.
- Reject stale, expired, replayed, or mismatched quotes. Do not silently refresh a quote after the user has confirmed its terms.

## 4. Quote and transaction integrity

Before a wallet prompt is possible, validate all transaction fields against independently configured allowlists and the quote:

- Chain ID is exactly 5042 for both input and output.
- Input and output token addresses match the Mainnet token registry and are not equal.
- Input amount exactly matches the user-confirmed base-unit amount.
- Output recipient exactly matches the active wallet account.
- Minimum output is a positive integer and does not exceed quoted output.
- Routing mode is explicitly supported. Unimplemented UniswapX/order-signing routes must be rejected.
- Router and spender are exact, versioned, chain-specific allowlist entries. Never trust an arbitrary upstream `to` or spender address.
- Decode calldata and independently verify function selector, token path, recipient, amount-in, minimum-out, deadline, and native value.
- Reject unexpected calls, multicalls, arbitrary approvals, Permit2 messages, or extra transactions unless their complete semantics are explicitly implemented and reviewed.
- Enforce a short, bounded deadline and a documented slippage ceiling.

A quote response is untrusted input even when received over TLS from the configured provider.

## 5. Strict simulation and preflight policy

Mainnet execution must fail closed if any required check fails or is unavailable:

- `eth_call` simulation of every approval and swap transaction.
- `eth_estimateGas` for every transaction, with a bounded and documented safety margin.
- Sufficient token balance, native gas balance, and allowance checks against the exact spender.
- Re-check quote expiry, wallet account, chain ID, and balance immediately before submission.
- Reject RPC disagreement or malformed responses where the affected field cannot be independently verified.

The existing Testnet `preflightSwap()` behavior that warns and continues after an `eth_estimateGas` failure is a Testnet-specific compatibility exception. It must never be copied into a Mainnet adapter or generalized into shared Mainnet execution code. A Mainnet simulation failure must not be converted into a warning.

## 6. Approval and signing UX

- Approval and swap are distinct wallet-confirmed actions unless the selected integration has a separately reviewed atomic mechanism.
- Never request an approval before the user has reviewed the spender, token, and exact amount.
- Do not request unlimited allowance by default.
- Never sign typed data or transactions in the background, from a quote refresh, or as a side effect of opening the swap panel.
- The final confirmation must reflect the exact calldata that will be submitted. If any bound field changes, invalidate the confirmation and require a new review.
- No automatic retries for approvals or swaps after ambiguous submission. First reconcile the transaction hash and on-chain state.

## 7. Receipt verification and accounting

- Query receipts only through an Arc Mainnet RPC path associated with chain ID 5042.
- Verify receipt status, transaction destination, sender, and relevant token-transfer/swap logs.
- Compare actual received amount with the user's confirmed minimum output.
- Distinguish submitted, pending, confirmed, reverted, and unknown states. A timeout is not proof of failure and must not trigger a duplicate transaction.
- Store the quote identifier and transaction hash for audit correlation without storing API credentials or signing secrets.

## 8. Required automated tests

Before any Mainnet execution release, tests must prove:

1. Mainnet is blocked before wallet-provider access while the feature is disabled.
2. Testnet execution cannot receive a Mainnet router, token registry, spender, or receipt chain key.
3. Wrong chain/account after quote and immediately before submission prevents wallet prompts.
4. Mismatched token, amount, recipient, router, spender, minimum output, deadline, or chain ID rejects before signing.
5. Missing, failed, timed-out, or inconsistent simulation rejects before signing.
6. Approval amount is exact and approval spender is allowlisted.
7. Unimplemented routing modes, Permit2 payloads, and arbitrary calldata reject before signing.
8. Stale quotes and duplicate submissions are rejected or safely reconciled.
9. No signing or broadcast occurs during quote refresh, UI rendering, or preflight.
10. Receipt verification uses Mainnet and validates the actual received amount.
11. Testnet regression tests continue to pass without relaxing the Testnet-specific RPC compatibility behavior.

Use mocked wallet providers for unit tests and a controlled fork or provider simulation for integration tests. Do not use real funds for tests.

## 9. Release gates

A Mainnet execution release requires all of the following:

- A selected integration with documented Arc Mainnet support, verified router/settlement contracts, and demonstrated liquidity or authorized StableFX access.
- Independent security review of the adapter, calldata decoder, approvals, simulation, wallet UX, and receipt verification.
- CI and dependency audit green on the exact release commit; skipped audit enforcement steps must be reviewed explicitly.
- Preview integration tests using non-production credentials and test wallets, with no real signing or broadcast.
- A documented rollback/kill switch that disables Mainnet before wallet access.
- Explicit approval from the project owner before changing the UI gate, enabling Production configuration, merging, or promoting a deployment.

**Until every gate is met, Mainnet remains quote-only and the Swap button remains disabled.**
