# Arc Mainnet Swap Execution Security Specification

**Status:** Encrypted quote sessions, Permit2 validation, exact-approval preflight, gated unsigned swap preparation, local simulation, wallet-state guard, and receipt verification groundwork implemented; Mainnet wallet execution remains disabled.
**Scope:** Future wallet-confirmed Arc Mainnet swaps through a separately verified DEX adapter or an authorized Circle StableFX integration.
**Non-goal:** This document does not authorize deployment, enable a feature flag, sign transactions, or broadcast transactions.

## 1. Current execution boundary

- The Mainnet quote proxy returns a normalized quote summary, a 60-second AES-256-GCM encrypted quote-session token, and only the exact Permit2 typed-data message needed for an explicit wallet signature. It never returns upstream swap calldata or approval transactions. Quotes request EXACT Permit2 amounts and restrict routes to V2/V3 exact-input pools.
- `AGFUSION_QUOTE_SESSION_SECRET` is configured as a sensitive Preview-only variable scoped to this feature branch. It is not configured for Production or Development.
- `POST /api/uniswap/preflight` performs read-only token, native gas, ERC-20 allowance, and Permit2 allowance/nonce checks. If needed, it returns unsigned exact-amount ERC-20 approval calldata to the canonical Permit2 contract only.
- `POST /api/uniswap/swap` is a gated preparation endpoint. It defaults to HTTP 403 unless `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=true`; the Preview branch explicitly sets this switch to `false`. If separately enabled for controlled review, it validates the encrypted quote binding and Permit2 signature, requests Uniswap `/swap` with upstream simulation enabled, validates Universal Router calldata, performs local `eth_call` and `eth_estimateGas`, and returns unsigned transaction data only. It never prompts a wallet or broadcasts.
- The browser UI may display a Mainnet quote, but its Swap action remains disabled.
- `runProductionSwap()` is restricted to the exact `Arc_Testnet` chain before wallet-provider access. The existing ApexiSwap execution path remains Testnet-only.
- `POST /api/circle/swap/prepare` rejects Mainnet. A Circle estimate is not unsigned transaction data.
- `POST /api/uniswap/receipt` verifies a submitted transaction against an encrypted 24-hour receipt ticket, Arc Mainnet transaction metadata, exact input token transfer, and minimum output token transfer. It is read-only and cannot submit transactions.
- `assertArcMainnetWalletState()` is a pure guard for rechecking chain ID 5042 and the quoted account immediately before a future wallet prompt. It is not yet wired into a wallet execution UI.
- No Mainnet execution code may reuse Testnet router addresses, token metadata, RPC fallback lists, chain keys, or approval assumptions.

The adapter in `src/blockchain/uniswap-mainnet-adapter.ts` uses `@uniswap/universal-router-sdk` 5.16.2 and explicitly passes `UniversalRouterVersion.V2_1_2`. It accepts only a narrow set of exact-input V2/V3 commands and verifies raw command flags, wallet, chain, router, quote age, deadline, input amount, allowlisted token path, output recipient, quote output/minimum bounds, canonical calldata, and gas fields. The adapter remains pure validation. The API orchestration around it is separately gated and does not sign or broadcast.

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
- Reject unexpected calls, multicalls, arbitrary approvals, Permit2 signature commands, nested subplans, V4, exact-output, allow-revert flags, and extra transactions unless their complete semantics are explicitly implemented and reviewed. The validator accepts only an exact `PERMIT2_TRANSFER_FROM` funding command when it is first in the command stream, targets the router, and transfers the exact quoted input. A pre-existing Permit2 allowance must still be checked independently before execution.
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

## 10. Verified Uniswap Arc deployment references

The current official Uniswap Trading API documentation lists Arc (chain ID 5042) as a supported swapping chain and publishes the following Universal Router 2.1.2 deployment:

- Arc Universal Router 2.1.2: `0x8702463e73f74d0b6765aBceb314Ef07aCb92650`
- Arc Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- The no-Permit2 Proxy Approval flow uses `0x0000000085E102724e78eCd2F45DC9cA239Affad`, but Arc is not in the current official deployment list for that proxy. AGFusion must not use `x-permit2-disabled: true` on Arc.
- The API supports `POST /quote` and `POST /swap`; `/swap` returns an unsigned transaction object. The integrator remains responsible for wallet signing and on-chain submission.
- Arc is also listed for UniswapX V3, but this AGFusion design remains restricted to `CLASSIC` routes until a separate UniswapX order-signing and settlement review is completed.

These references establish that an official Uniswap route exists for Arc; they do not establish that AGFusion's transaction flow is safe or ready. Before using the router, verify its address and deployed bytecode against the current official Supported Chains & Tokens page and on-chain Arc state. Pin the router version to `2.1.2`; do not use the older Arc Universal Router deployment or infer a router from another chain.

Official references:
- https://developers.uniswap.org/docs/trading/swapping-api/supported-chains
- https://developers.uniswap.org/docs/api-reference/create_swap_transaction
- https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide
- https://developers.uniswap.org/docs/protocols/v4/deployments

## 11. Transaction-adapter implementation checkpoint (not yet release-ready)

The next implementation unit is a dedicated Uniswap Universal Router transaction adapter. It is intentionally not implemented by forwarding the upstream `/swap` response directly to a wallet.

Before the adapter can be enabled, the repository must pin and audit a compatible `@uniswap/universal-router-sdk` release and its transitive dependency graph, then use the SDK's version-aware command parser for Universal Router **2.1.2**. A generic ABI decode of only the outer `execute(bytes,bytes[],uint256)` envelope is insufficient: the command stream and nested inputs must also be decoded and semantically checked. Do not hand-roll partial command decoding or assume that a router destination plus a valid selector makes calldata safe.

The adapter implementation must be split into independently testable pure validation and wallet-provider stages. The pure stage must reject, before any wallet prompt:

- any transaction whose chain ID is not exactly 5042 or whose destination is not the verified Arc Universal Router 2.1.2 address;
- any route other than CLASSIC, unsupported command byte, nested call, token, recipient, spender, or approval;
- any mismatch between the user's confirmed input amount and decoded command input, or between the decoded minimum output and the validated quote;
- any non-zero native value, unexpected transaction, unbounded deadline, stale quote, or Permit2 signature/payload while Permit2 support remains disabled;
- any transaction whose decoded command semantics cannot be completely established by the pinned SDK parser.

The wallet stage must re-check the connected account and chain immediately before simulation and again immediately before asking the wallet to sign. Every approval and swap must pass strict `eth_call` and `eth_estimateGas`; a missing RPC response, timeout, revert, or malformed response is a hard stop. No automatic retry is allowed after an ambiguous submission.

**Current checkpoint:** quote preview, encrypted quote-session binding, Permit2 signature validation, read-only preflight, exact approval calldata construction, gated `/swap` transaction preparation, SDK command decoding, upstream and local simulation, wallet-state guard, and read-only receipt verification are implemented with automated tests. Wallet signing, UI confirmation, transaction broadcast, and end-to-end real-wallet flow remain unimplemented. The Preview preparation flag is explicitly false. Mainnet execution therefore remains disabled.


## 11. Current validation-only implementation

- The quote endpoint no longer sends `x-permit2-disabled: true`. That header selects Uniswap's Proxy Approval flow, which sends swaps to a separate proxy contract rather than the Universal Router.
- Uniswap's current Proxy Approval deployment list does not include Arc (5042). Do not use that flow on Arc unless Uniswap explicitly adds and verifies Arc support for the proxy.
- The Arc quote endpoint requests only V2 and V3 protocols. V4 action decoding is not part of the current validator.
- The transaction validator accepts only Universal Router 2.1.2 with an explicit execute deadline, exact input, and a narrow command sequence: optional exact Permit2 transfer, one V2/V3 exact-input swap, and optional final sweep to the quoted wallet.
- Permit2 typed-data validation, exact-amount ERC-20 approval construction, and read-only allowance checks are implemented as separate modules. Wallet signing and transaction submission remain intentionally unwired.
- The adapter tests cover 17 positive and negative cases. The full repository test suite passed locally; the production build and CI must still pass on the committed head.

Official Proxy Approval reference:
- https://developers.uniswap.org/docs/trading/swapping-api/concepts/no-permit2-workflow


## 12. Encrypted quote-to-receipt pipeline checkpoint (2026-11-08)

The current implementation is deliberately split into four server-side stages:

1. **Quote:** `POST /api/uniswap/quote` requests CLASSIC V2/V3 with `permitAmount: "EXACT"`, validates the wallet/token/amount/output/recipient, and returns a normalized summary plus a 60-second encrypted quote session. The raw quote and Permit2 payload are bound to the exact account, chain, token pair, base-unit amount, output, and minimum. The typed-data payload is returned only because the wallet must sign that exact Permit2 message.
2. **Preflight:** `POST /api/uniswap/preflight` reads token balance, native gas balance, ERC-20 allowance to Permit2, and Permit2 allowance/nonce/expiry. If ERC-20 approval is missing, it returns only an unsigned exact-amount approval to the canonical Permit2 contract. The user must wait for approval confirmation and obtain a fresh quote because quote sessions expire after 60 seconds.
3. **Swap preparation:** `POST /api/uniswap/swap` requires the Preview-only `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED` switch. It is explicitly `false` in the current Preview branch. When enabled for controlled testing, it validates the quote session and Permit2 signature, verifies the live Permit2 nonce and allowance state, requests Uniswap `/swap` with `simulateTransaction: true`, decodes and validates the exact Universal Router 2.1.2 command stream, then requires local `eth_call` and `eth_estimateGas` to pass with sufficient native USDC for gas plus reserve. It returns an unsigned transaction only.
4. **Receipt:** a separate encrypted 24-hour receipt ticket binds the wallet, input/output tokens, exact input, and minimum output. `POST /api/uniswap/receipt` checks transaction chain/sender/router, successful receipt status, exact input token Transfer amount, and output token Transfer amount at or above the quoted minimum.

Security limitations still open:
- The wallet UI does not yet call these endpoints or present the complete approval/Permit2/swap confirmation sequence.
- The wallet chain/account guard exists as a pure helper but must be integrated immediately before each wallet prompt and submission.
- No transaction signing, broadcasting, retries, or live-funds end-to-end test has been performed.
- Receipt verification requires a real transaction hash supplied after an independently confirmed wallet submission; no transaction was submitted as part of this work.
- The Preview preparation flag must remain false until independent security review and a separate explicit release decision.
