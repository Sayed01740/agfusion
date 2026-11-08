# Arc Mainnet Swap Preparation Release Gate

## Network configuration

| Setting | Arc Mainnet | Arc Testnet |
| --- | --- | --- |
| Chain ID | 5042 | 5042002 |
| Hex chain ID | 0x13b2 | 0x4cef52 |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://testnet.arcscan.app |
| Circle App Kit chain | Arc | Arc_Testnet |

## Chain-specific token metadata

Arc USDC uses the same ERC-20 address on Mainnet and Testnet:
`0x3600000000000000000000000000000000000000`.

EURC is different across networks:
- Mainnet: `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`
- Testnet: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`

The API passes token symbols to Circle App Kit. Before enabling Mainnet, Preview verification must prove that App Kit resolves EURC to the Mainnet address above for the `Arc` chain and never uses the Testnet EURC address. The route must not treat a Testnet token address as valid Mainnet metadata.

## Default-safe behavior

The Circle swap-preparation endpoint defaults to Arc Testnet when `chainId` is omitted. Unsupported chain IDs are rejected.

Arc Mainnet requests to the Circle swap-preparation route are always rejected. The legacy `ARC_MAINNET_SWAP_ENABLED` variable is not an authorization mechanism and must not be used to bypass this gate. The route returns `503 mainnet_swap_not_ready` for Mainnet even if the legacy variable is set. Do not configure a Mainnet execution flag in any environment.

## Required release gates

1. CI passes on the exact proposed release commit: Circle SDK compatibility, Elliptic regression, lint, typecheck, unit tests, and production build.
2. Dependency audit passes, with any skipped enforcement step explicitly reviewed.
3. Independent security review confirms chain binding, RPC trust, token/quote integrity, and that the endpoint only prepares unsigned transaction data.
4. Preview verification confirms Testnet default behavior, Mainnet disabled behavior, and gated Mainnet preparation using non-production credentials and no wallet signing or broadcast.
5. Confirm the production RPC, explorer, Circle App Kit Mainnet support, and Mainnet token metadata against current official Circle documentation before enabling the flag.
6. Obtain explicit release approval before enabling the Production environment flag or merging/promoting the release.

## Rollback

Keep Mainnet execution disabled in code. If a legacy `ARC_MAINNET_SWAP_ENABLED` variable exists, remove it from the environment and redeploy. Verify that the Circle Mainnet preparation route returns `503 mainnet_swap_not_ready` and the browser execution guard blocks before wallet-provider access. Testnet behavior should remain unchanged.

## Operational boundary

The Circle preparation API returns estimate information only. The Uniswap quote proxy returns a normalized quote summary, a short-lived encrypted quote-session token, and the exact Permit2 typed-data message only when a wallet signature is required. The separately gated Uniswap swap-preparation endpoint can return unsigned transaction data only when its server-side switch is explicitly enabled. Neither endpoint signs or broadcasts a transaction. Never treat a successful quote as transaction approval. Mainnet transactions use real assets and are irreversible.


## Current UI execution boundary

The current browser swap UI executes through `runCircleSafeSwapFlow()` and `runProductionSwap()`; it does not call the server-side `/api/circle/swap/prepare` route. The browser Mainnet quote/execute path is therefore explicitly fail-closed until a supported integration is completed.

Do not re-enable Mainnet in the UI by changing a public network flag. Circle StableFX is permissioned and requires approved access, a live RFQ quote, trade-intent/funding authorization, and verified PvP settlement data. A reference FX rate or a direct call to the FxEscrow address is not a valid swap implementation. Circle App Kit `estimateSwap()` returns quote information and does not itself supply an unsigned transaction for a browser wallet.

Before re-enabling Mainnet UI swaps:
1. Confirm AGFusion has approved StableFX participant access and the required StableFX API credential, or select a separately verified Mainnet DEX with a published router ABI and live liquidity.
2. Implement the documented RFQ/trade-intent/settlement workflow or verified DEX route, with wallet-confirmed typed-data/transaction steps.
3. Add end-to-end tests through the actual UI execution path and confirm no signing or broadcast occurs before explicit user wallet confirmation.
4. Keep Mainnet disabled until independent security review and explicit release approval.


## Swap-preparation API contract

`/api/circle/swap/prepare` returns a Circle App Kit estimate only; an estimate contains quote fields such as estimated output, stop limit, and fees. It is not unsigned transaction calldata and must never be treated as a prepared executable transaction. Arc Mainnet returns `503 mainnet_swap_not_ready` even if the legacy `ARC_MAINNET_SWAP_ENABLED` flag is set, until an authorized StableFX or independently verified Mainnet DEX integration is implemented. The actual browser UI execution path is separately fail-closed for Mainnet.


## Uniswap Trading API quote preview (Arc Mainnet)

Arc Mainnet quotes use the server-side `/api/uniswap/quote` proxy. The API key must be configured as `UNISWAP_API_KEY` in the Vercel Preview environment only for quote testing. Never use a `NEXT_PUBLIC_*` variable and never expose the key to the browser.

- Fixed chain ID: `5042`.
- Explicit Universal Router version: `2.1.2` (Arc does not support the older 2.0 deployment).
- Mainnet token addresses: USDC `0x3600000000000000000000000000000000000000` (6 ERC-20 decimals), EURC `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` (6 decimals), cirBTC `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` (8 decimals).
- The proxy accepts only same-chain Arc Mainnet exact-input quotes and currently restricts routing to CLASSIC V2/V3. V4 command decoding and UniswapX order signing are not implemented.
- The proxy returns a normalized quote summary, a 60-second encrypted quote-session token, and the exact Permit2 typed-data payload only when a wallet signature is required. Raw quote details remain encrypted in the session; swap calldata and approval transactions are not returned by the quote endpoint.
- The request does not set `x-permit2-disabled`. Uniswap's Proxy Approval contract is not listed as deployed on Arc, so the no-Permit2 flow is not an approved option for this network.
- `@uniswap/universal-router-sdk` is pinned to `5.16.2`, and the validation-only adapter explicitly decodes with `UniversalRouterVersion.V2_1_2`. The validator rejects unsupported commands and does not sign or broadcast.
- The UI may display a Mainnet quote, but the Swap button remains disabled. The existing Testnet execution path is unchanged.

Before enabling Mainnet execution, implement a separate wallet-confirmed approval/Permit2 and swap flow, verify router destination, chain ID, token pair, spender, amount, minimum output, deadline, gas and simulation, then add end-to-end tests. Live liquidity and quotes must be checked with the configured API key; supported chain status alone does not guarantee a route.


## Current adapter checkpoint

The validation-only adapter at `src/blockchain/uniswap-mainnet-adapter.ts` verifies Arc chain ID 5042, the official Universal Router 2.1.2 destination, the quoted sender, quote freshness, exact input, V2/V3 token path, per-hop slippage bounds, final minimum output, zero native value, gas fields, and a bounded execute deadline. It rejects Permit2 signature commands, V4, exact-output, subplans, unknown commands, and allow-revert flags.

The adapter is not wired into the browser swap flow. The backend now implements Permit2 typed-data validation, exact ERC-20 approval calldata construction, read-only allowance/balance checks, strict Mainnet simulation, a wallet chain/account guard helper, and read-only receipt verification. The browser confirmation/orchestration UI, wallet signing, transaction submission, and post-submission tracking remain mandatory work before any Mainnet execution review.


## Current implementation checkpoint (2026-11-09)

Backend groundwork on the isolated Arc Mainnet feature branch includes encrypted quote sessions, Permit2 typed-data validation, exact approval calldata construction, read-only allowance/balance checks, strict Mainnet simulation, wallet chain/account guard helpers, and read-only receipt verification. The Uniswap adapter validates Arc chain ID 5042, the official Universal Router 2.1.2 destination, sender, quote freshness, token path, slippage bounds, minimum output, native value, gas fields, and execute deadline. It rejects unsupported command paths.

The browser approval/Permit2/swap confirmation flow, wallet signing, transaction broadcast, post-submission tracking, live-liquidity end-to-end validation, and independent security review are not complete. The browser Mainnet execution path remains fail-closed, and the Swap action remains disabled.

## Durable quote-session replay protection (2026-11-09)

The quote-session replay guard now uses a dedicated Cloudflare D1 Worker rather than Prisma/PostgreSQL:

- Quote creation hashes the opaque encrypted session token with SHA-256 and sends only the digest to the authenticated Worker over HTTPS. The raw token and encrypted quote payload are never sent to D1.
- The Worker stores the digest, normalized wallet account, fixed Arc chain ID 5042, expiry, and consumption timestamp.
- Registration uses a parameterized INSERT with a unique token-hash primary key.
- Consumption uses one parameterized conditional SQL UPDATE requiring the digest, account, chain ID, unexpired timestamp, and `consumed_at IS NULL`. Exactly one request can update the row; replays return HTTP 409.
- Missing configuration, network timeout, Worker authentication/configuration failure, or D1 outage fails closed with HTTP 503.
- A scheduled cleanup removes expired records older than 24 hours in bounded batches.
- The Prisma `ArcQuoteSession` model and its migration have been removed. Prisma/PostgreSQL remains the application's existing data layer for unrelated user, transaction, and x402 records.

The Worker source, D1 schema, Wrangler template, Next.js client, and unit tests are in `workers/quote-session-store` and `src/lib/arc-quote-session-store.ts`. See [the D1 Worker runbook](./ARC_MAINNET_D1_WORKER_RUNBOOK.md).

### Provisioning and validation status

The code and local unit tests are committed on `feature/arc-quote-session-d1-worker-20261109`. A real Cloudflare D1 database ID, Worker API secret, deployed Worker URL, Vercel Preview secrets, and remote D1 concurrent-consume test are not yet available. Cloudflare account provisioning and deployment require account access; do not mark these steps complete until verified.

Cloudflare's official D1 documentation confirms that Worker bindings use prepared statements and parameter binding, and that D1 write results expose `meta.changes`. The consume path relies on a single conditional UPDATE, not a read-then-write sequence:
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/worker-api/return-object/

Still not implemented: wallet UI approval/Permit2/swap orchestration, user-facing transaction confirmations, wallet signing/broadcast, post-submission tracking, live liquidity validation, and independent security review. Keep `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=false`. No Mainnet signing or broadcast is enabled by this work.
