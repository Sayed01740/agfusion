# Arc Mainnet Swap Preparation Release Gate

## Network configuration

| Setting | Arc Mainnet | Arc Testnet |
| --- | --- | --- |
| Chain ID | 5042 | 5042002 |
| Hex chain ID | 0x13b2 | 0x4cef52 |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://testnet.arcscan.app |
| Circle App Kit chain | Arc | Arc_Testnet |

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
