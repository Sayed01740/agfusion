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

Arc Mainnet requests are rejected with HTTP 403 unless the server-side environment variable below is explicitly enabled:

```dotenv
ARC_MAINNET_SWAP_ENABLED=true
ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io
```

Do not set this flag in Production until the release gates below have been completed and separately approved. Do not expose the flag through a `NEXT_PUBLIC_*` variable.

## Required release gates

1. CI passes on the exact proposed release commit: Circle SDK compatibility, Elliptic regression, lint, typecheck, unit tests, and production build.
2. Dependency audit passes, with any skipped enforcement step explicitly reviewed.
3. Independent security review confirms chain binding, RPC trust, token/quote integrity, and that the endpoint only prepares unsigned transaction data.
4. Preview verification confirms Testnet default behavior, Mainnet disabled behavior, and gated Mainnet preparation using non-production credentials and no wallet signing or broadcast.
5. Confirm the production RPC, explorer, Circle App Kit Mainnet support, and Mainnet token metadata against current official Circle documentation before enabling the flag.
6. Obtain explicit release approval before enabling the Production environment flag or merging/promoting the release.

## Rollback

Set `ARC_MAINNET_SWAP_ENABLED=false` or remove the variable from the server environment, then redeploy the affected environment. Mainnet preparation must return HTTP 403. Testnet behavior should remain unchanged.

## Operational boundary

This API prepares a quote and returns transaction data. It does not authorize a wallet signature or broadcast a transaction. Never treat a successful quote as transaction approval. Mainnet transactions use real assets and are irreversible.


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
- The proxy accepts only same-chain Arc Mainnet exact-input quotes and currently restricts routing to CLASSIC (V2/V3/V4). UniswapX order signing is not implemented.
- The proxy returns quote summary only. It intentionally strips swap calldata, Permit2 payloads, and approval transactions.
- The UI may display a Mainnet quote, but the Swap button remains disabled. The existing Testnet execution path is unchanged.

Before enabling Mainnet execution, implement a separate wallet-confirmed approval/Permit2 and swap flow, verify router destination, chain ID, token pair, spender, amount, minimum output, deadline, gas and simulation, then add end-to-end tests. Live liquidity and quotes must be checked with the configured API key; supported chain status alone does not guarantee a route.
