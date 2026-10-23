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
- Complete end-to-end low-value canary tests for send, swap, bridge, escrow,
  agent spending, identity registration, x402, and transaction reconciliation.
- Do not launch a feature whose production dependencies or contract addresses
  have not been validated.

## Current implementation status

The first isolated code change makes `src/lib/config.ts` derive the public and
internal network label/chain ID from `src/lib/arc-chain.ts`. The Testnet values
remain the same when Testnet is selected. This is not a full Mainnet migration:
bridge peer-chain routing, CCTP aliases, spending policy, contracts, fees,
secrets, and deployment verification still require separate changes and tests.
