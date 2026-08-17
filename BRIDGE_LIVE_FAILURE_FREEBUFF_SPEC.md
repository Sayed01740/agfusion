# AGFusion Bridge Live Failure / Local Sync Specification

## Current verified GitHub source

Repository: `Sayed01740/agfusion`

Validated bridge implementation commit:
`071e41b0d9261ef46e4387a66baa8c9c681a99e6`

Branch containing this implementation:
`bridge-fix-final-local`

This branch starts from that exact implementation commit.

## Important finding from the current browser error

The user is still seeing:

`Detail: Network connection failed for Arc Testnet`

with the bridge UI remaining at `Waiting to start`.

This is important: the error occurs BEFORE `kit.bridge()` starts the CCTP steps. The current implementation performs an explicit `/api/rpc` source/destination preflight before calling `kit.bridge()`.

Therefore this error must be treated as an RPC/preflight/deployment/environment problem first, not as proof that the CCTP approval/burn/mint flow itself is broken.

## Deployment distinction

`master` is still behind the validated bridge implementation. The production domain can therefore still serve the old `master` implementation while `bridge-fix-final-local` is only a Vercel preview.

Do not assume that testing the production URL tests commit `071e41b`.

The local agent MUST identify the exact commit that is actually being served by the browser before diagnosing the live result.

## Current validated bridge implementation

The `071e41b` implementation already contains:

- one App Kit adapter for source/destination;
- one explicit source-chain preflight;
- no bridge KIT_KEY hard gate;
- retry only for SDK-retryable errors;
- semantic destination mint/receive verification;
- on-chain destination receipt verification;
- recovery without duplicate burn;
- 24 bridge-specific tests.

Do not undo these changes.

## Current RPC implementation

The GitHub branch uses `/api/rpc` with server-side upstream failover.

Arc Testnet expected chain ID:
`5042002`
hex:
`0x4cef52`

The Arc RPC upstream list is defined in:
`src/lib/rpc-proxy.ts`

The `/api/rpc` route is:
`src/app/api/rpc/route.ts`

The current official Arc documentation lists these Arc Testnet HTTP endpoints:

- `https://rpc.testnet.arc.io`
- `https://rpc.blockdaemon.testnet.arc.io`
- `https://rpc.drpc.testnet.arc.io`
- `https://rpc.quicknode.testnet.arc.io`

Do not replace them with speculative URLs.

## Required local investigation

The local agent has access to the real local environment variables/keys. Use them locally but NEVER print or commit their values.

Before changing bridge logic, determine whether the browser is actually running:
`071e41b0d9261ef46e4387a66baa8c9c681a99e6`

Then test locally:

1. `GET /api/rpc?chain=arc`
2. `POST /api/rpc?chain=arc` with `eth_chainId`
3. `GET /api/rpc?chain=base`
4. `POST /api/rpc?chain=base` with `eth_chainId`

Expected:

Arc: `0x4cef52`
Base Sepolia: `0x14a34`

If local succeeds but production fails, the issue is deployment/runtime/network configuration, not the wallet bridge adapter.

If both local and production fail, inspect the actual `/api/rpc` upstream diagnostics and network reachability.

If RPC preflight succeeds but `kit.bridge()` fails, then inspect App Kit/adapter/Circle flow.

## Required diagnostic logging

Add temporary, safe diagnostics if necessary, but never log secrets, wallet addresses unless already public, tokens, keys, or request bodies containing credentials.

For RPC preflight, expose enough information to distinguish:

- unknown chain
- all upstreams failed
- chain mismatch
- HTTP failure
- timeout
- invalid JSON
- successful upstream

Do not expose upstream credentials or private configuration.

## Do not hide the root cause

Do not convert an RPC failure into the generic:
`Network connection failed for Arc Testnet`

The UI should surface the actual proxy failure reason, for example:

`Arc RPC preflight failed: all_upstreams_failed ...`

or

`Arc RPC returned unexpected chain ID ...`

or

`Production deployment is serving commit ... while expected commit is 071e41b...`

## Local sync target

The local agent must import the validated implementation from GitHub:

`071e41b0d9261ef46e4387a66baa8c9c681a99e6`

Do not cherry-pick old trigger commits:

- `07eb280`
- `305a1d6`
- `d644d7f`
- `7708940`

Those are not the bridge implementation.

## Preserve local secrets

The local `.env`, `.env.local`, Vercel environment variables, Circle credentials, wallet credentials, and private configuration are LOCAL ONLY.

Never pull secrets from GitHub.
Never commit them.
Never replace local secret values with GitHub examples.

## Final validation

After synchronizing the implementation locally:

- `npm run typecheck`
- `npm test`
- `npm run build`

Then run the local browser app with the real local environment.

Test first:

Circle Email Wallet:
Arc Testnet -> Base Sepolia

Then:

Base Sepolia -> Arc Testnet

Then an EVM browser wallet if available.

Record the exact failing layer if a live test fails.

## Final Git workflow

Do not push directly to `master`.

Create/update a branch such as:
`bridge-live-fix-local`

Push only validated source changes.

Create a PR to `master`.

Do not claim the bridge is fixed unless a real bridge transaction reaches the destination and the destination receipt is confirmed.
