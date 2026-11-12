# Arc Mainnet Swap Preview Runbook

## Current scope

The Mainnet swap UI uses the server-side Uniswap quote/session API. The UI can request a quote and, when the Preview preparation gate is explicitly enabled, request an unsigned transaction after wallet and Permit2 validation.

This is not a live swap execution release:
- The server returns `executionEnabled: false`.
- AGFusion does not call `eth_sendTransaction`, `wallet_sendCalls`, or broadcast a signed swap transaction in this flow.
- Production transaction preparation is blocked. The preparation gate requires both `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED=true` and `VERCEL_ENV=preview`.
- Keep the Preview preparation flag set to `false` until independent security review and owner approval.

## Preview environment variables

Set these only on the dedicated Preview branch `feature/arc-quote-session-d1-worker-20261109`:

| Variable | Purpose | Current requirement |
| --- | --- | --- |
| `UNISWAP_API_KEY` | Server-only Uniswap Trade API access | Required for live quote requests |
| `AGFUSION_QUOTE_SESSION_SECRET` | AES-256-GCM short-lived quote-session encryption | Required |
| `AGFUSION_QUOTE_SESSION_STORE_URL` | Dedicated Cloudflare D1 quote-session Worker URL | Required |
| `AGFUSION_QUOTE_SESSION_STORE_TOKEN` | Bearer credential for the D1 Worker | Required |
| `AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED` | Explicit Preview-only preparation gate | Keep `false` |

The current Preview branch already has the quote-session secret, D1 Worker URL, D1 Worker token, and a disabled preparation flag. It does not currently have a branch-specific `UNISWAP_API_KEY`. A Preview-only key is present on the older branch `feature/arc-mainnet-swap-support-20261106`; copy it into the current branch's Preview environment through Vercel's environment settings without pasting the secret into source control or chat.

Never copy any of these credentials to Production as part of this runbook.

## Request and wallet flow

1. The UI reads the connected provider's `eth_chainId` and `eth_accounts`. It requires chain ID 5042 and the same account used for the quote.
2. `POST /api/uniswap/quote` validates the input pair, amount, slippage, wallet, chain, and Uniswap response. It rejects unsupported routing and mismatched token/amount/recipient data.
3. The server encrypts the quote session and registers its token digest in the D1 replay-protection Worker.
4. Before any Permit2 wallet signature, the UI calls `GET /api/uniswap/swap`. The endpoint only reports preparation as enabled when the server flag is true and the runtime is explicitly Vercel Preview.
5. If enabled, the UI rechecks chain and account, requests the exact Permit2 typed-data signature only when the quote requires it, then calls `POST /api/uniswap/swap`.
6. The server performs token/gas/allowance preflight, atomically consumes the session, validates Universal Router calldata against the quote, and simulates the unsigned transaction.
7. The UI displays the unsigned transaction details. It does not sign or broadcast the swap transaction.

A quote session is single-use and short-lived. If it expires, is consumed, or any preflight condition changes, request a new quote.

## Verification gates

- [ ] Preview-only `UNISWAP_API_KEY` added to the exact branch above.
- [ ] Vercel Preview build for the latest PR #58 commit is READY.
- [ ] Quote endpoint returns a real Arc Mainnet quote and registers one D1 session.
- [ ] D1 concurrent consume still returns exactly one success and one replay rejection.
- [ ] Permit2 signature path is exercised with a dedicated test wallet and no transaction broadcast.
- [ ] Unsigned transaction preparation is verified only after independent review authorizes enabling the Preview flag.
- [ ] Production remains disabled.
- [ ] Independent cryptographic/security review of PR #29 is complete and recorded.

## Safety boundary

Do not use Production wallet credentials, do not sign or broadcast a Mainnet swap transaction during Preview verification, and do not enable Production. The current scope ends at validated unsigned transaction preparation.
