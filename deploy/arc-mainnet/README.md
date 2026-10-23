# AG Fusion Arc Mainnet isolated rollout

This directory is additive. It must not replace or edit the existing Arc Testnet
configuration. Testnet remains the default when `NEXT_PUBLIC_ARC_NETWORK` is not
`mainnet` and the chain ID is not explicitly set to 5042.

## Safety rules

1. Do not merge this rollout into the Testnet deployment until the Mainnet branch
   passes CI, app tests, contract tests, and an independent contract review.
2. Do not reuse Testnet contract addresses on Mainnet. Deploy and verify new
   contracts with a dedicated Mainnet deployer and reviewed multisig ownership.
3. Never commit API keys, database URLs, auth secrets, or private keys.
4. Do not enable cross-chain routes until every source and destination RPC,
   chain ID, CCTP domain, USDC address, TokenMessenger and MessageTransmitter
   address has been checked against current official provider documentation and
   on-chain bytecode.
5. No deployment is allowed to claim "100% secure". Use staged canary limits,
   monitoring, and a documented pause/rollback plan.

## Configuration

Use `.env.mainnet.example` as a checklist, not as a file to upload verbatim.
Set the Mainnet values only in a separate Vercel Preview/Production deployment
or a dedicated project. Keep the current Testnet environment variables unchanged.

## Required validation gates

- Confirm RPC `eth_chainId` returns `0x13b2` before enabling writes.
- Confirm wallet chain ID is 5042 before signing any Arc Mainnet transaction.
- Confirm public app config reports Arc Mainnet / 5042 only for Mainnet deployment.
- Confirm all Mainnet contracts are newly deployed, verified, and controlled by
  the intended multisig.
- Run `npm run typecheck`, `npm test`, `npm run build`, and
  `forge test` from `contracts/` using the project's pinned toolchain.
- Run `npm audit --omit=dev --audit-level=moderate` and review all remaining
  moderate/low findings, not only the CI threshold.
- Complete end-to-end low-value canary tests for send, swap, bridge, escrow,
  agent spending, identity registration, x402, and transaction reconciliation.
- Do not launch a feature whose production dependencies or contract addresses
  have not been validated.

## Dependency remediation status

The isolated branch refreshes the lockfile and adds overrides for patched
transitive packages, including `@grpc/grpc-js`, `toml`, UUID, nested `bn.js`,
plus the existing PostCSS and Undici baselines. The legacy `jayson` dependency
was moved to 5.x to remove its vulnerable `stream-json` 1.x dependency; this
major override must pass the full test/build suite and bridge/wallet smoke tests
before adoption.

The elliptic advisory currently has no upstream patched version. Keep this
finding visible in the release review; do not claim a clean audit means all
cryptographic dependencies are free of risk. Reassess it when an upstream fix
or a compatible replacement for the dependent Circle/Ethers packages is
available.

## Current implementation status

Implemented on the isolated feature branch:
- App config derives the network label and chain ID from the canonical Arc config.
- Arc Mainnet RPC fallback uses the canonical `arc.io` endpoint; wallet network setup fails closed if the RPC cannot be validated.
- Mainnet peer-chain RPC routing uses mainnet chain IDs and endpoints while Testnet defaults remain unchanged.
- Public swap RPC fallbacks verify the returned chain ID before reading contract state.
- CCTP bridging selects the source chain's configured TokenMessenger and rejects Mainnet/Testnet mixed-environment transfers.
- Mainnet swap execution is deliberately disabled until a verified live quote provider and settlement contract are available; the previous illustrative reference rates are not executable quotes.
- Agent autonomous spending fails closed on Mainnet if persistent policy storage is unavailable.
- CCTP v2 Mainnet addresses match Circle's current contract registry; Arc Testnet addresses remain on the sandbox configuration.
- `npm run verify:arc-mainnet` performs a read-only RPC chain-ID and contract-bytecode preflight.
- Next.js is pinned to a patched 15.5.28 baseline; production dependency audit and all current CI results must be green before release.

These are migration safeguards, not proof that every product feature is Mainnet-ready. Fee estimates, app-specific contract addresses and ownership, API/provider integrations, database migrations, all user flows, and contract tests still need verification. Do not enable real-money flows until all validation gates above pass.
