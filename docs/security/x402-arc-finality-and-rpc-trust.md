# x402 Arc finality and RPC trust policy

Date: 2026-11-04

## Scope and status

This note defines the evidence boundary for the Arc Testnet USDC receipt verifier. It does not activate x402, authorize settlement, or approve a production deployment. Both x402 HTTP routes must remain fail-closed and return `503 X402_DISABLED` until the independent review and activation gates are complete.

## Arc finality: do not import an Ethereum confirmation-count policy

Arc's official network documentation describes deterministic finality: a transaction is either unconfirmed or final once validated, with finality reached when more than two-thirds of the validator set commits a block. Arc's documentation states that finalized transactions do not require waiting for additional blocks.

References:
- Arc, Deterministic Finality on Arc (2025-10-09): https://www.arc.io/blog/deterministic-finality-on-arc
- Arc Network, Network overview and finality FAQ: https://www.arc.io/network
- Arc node documentation, independent block verification and JSON-RPC access: https://docs.arc.io/arc/concepts/running-a-node

Accordingly, AGFusion must **not invent a fixed Ethereum-style N-confirmation threshold** for Arc. The source-level verifier may check receipt inclusion and consistency with the block returned at the receipt height, but this is not itself a cryptographic proof of the validator commit certificate.

## Current verifier trust boundary

The verifier currently:
1. Queries the configured Arc Testnet RPC for chain ID.
2. Retrieves the transaction receipt.
3. Retrieves the block at the receipt height and compares its hash and number with the receipt.
4. Validates the exact configured USDC Transfer log, recipient and amount.

This is a same-provider consistency check. It does not independently verify the Arc consensus certificate, validator signatures, or the provider's implementation and data provenance. A malicious, stale, compromised, or misconfigured RPC could lie consistently across all three calls.

The verifier therefore must be treated as **RPC-trusting**, not independently finality-verifying. The current hard-coded public Testnet RPC is suitable for development/testing only unless the provider's operational guarantees, transport security, monitoring, and failure behavior are independently reviewed. A second provider can improve fault detection but does not automatically create cryptographic finality proof if both providers share infrastructure or upstream data.

## Activation requirements

Before any endpoint is wired to `settleX402Payment`:

- Obtain and document the exact Arc Testnet RPC provider/operator, its published service guarantees, TLS endpoint ownership, rate limits, and incident process.
- Confirm with Arc's current official documentation or node/RPC implementation that a successful `eth_getTransactionReceipt` response is served only after the block has passed Arc's deterministic commit/finality point. Do not infer this solely from the existence of a receipt or a matching canonical block hash.
- If the standard JSON-RPC response does not expose a verifiable finality certificate, explicitly accept the provider trust assumption in the threat model and obtain independent reviewer approval. Do not describe the verifier as cryptographically proving finality.
- Add operational handling for provider disagreement, stale heads, timeouts, unavailable RPC, and endpoint changes. All ambiguous or unavailable states must fail closed.
- Keep the atomic challenge-consumption and unique transaction-hash replay protections in place.
- Keep the payment routes disabled until the database rollout, independent source review, provider trust review, and explicit activation approval are complete.

## JSON-RPC envelope validation

The verifier now requires every response to:
- use JSON-RPC version `2.0`;
- echo the exact numeric request ID sent for that call;
- contain exactly one of `result` or `error`;
- provide a well-formed error object with an integer `code` and string `message` when `error` is present.

Malformed, mismatched, or ambiguous envelopes fail closed as `rpc_unavailable`. Regression tests cover mismatched IDs, wrong versions, simultaneous result/error members, and malformed error objects.

## Non-goals and safety boundary

This change does not add confirmation counts, change Arc Testnet wallet behavior, submit transactions, run migrations, change environment variables, promote a deployment, or enable Mainnet. x402 remains disabled.
