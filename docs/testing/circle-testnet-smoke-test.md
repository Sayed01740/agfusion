# Live Circle Testnet quote-preparation smoke test

This opt-in smoke test exercises the real `POST /api/circle/swap/prepare` endpoint against a local development server or a dedicated preview/staging deployment with Circle App Kit configured. It is not run by CI and does not use production credentials from the repository.

## Safety boundary

- The request explicitly pins `chainId: 5042002` (Arc Testnet).
- The script only requests quote/transaction preparation. It does **not** sign, submit, or broadcast the returned transaction.
- Use a wallet address you control or a dedicated test address.
- Do not paste Circle keys into the command line or source code. Configure the server-side `KIT_KEY` / `CIRCLE_KIT_KEY` in the local ignored `.env` or staging environment.
- Do not point this test at the production hostname. The script explicitly refuses `agfusion.vercel.app`.
- A successful response validates quote preparation only; it does not prove settlement execution, contract verification, or Mainnet readiness.

## Run

Start AGFusion locally with a valid server-side Circle Kit key, then in a separate terminal:

```bash
AGFUSION_TESTNET_SMOKE_URL=http://localhost:3000 \
AGFUSION_TESTNET_SMOKE_ADDRESS=0x0000000000000000000000000000000000000001 \
AGFUSION_TESTNET_SMOKE_CONFIRM=I_UNDERSTAND_TESTNET_ONLY \
AGFUSION_TESTNET_SMOKE_AMOUNT=1 \
node scripts/smoke-test-circle-testnet-swap-prepare.mjs
```

Replace the example address with your own test wallet address. For a remote preview/staging URL, use HTTPS and set `AGFUSION_TESTNET_SMOKE_URL` to that base URL.

Optional variables:

- `AGFUSION_TESTNET_SMOKE_AMOUNT` — positive decimal, default `1`
- `AGFUSION_TESTNET_SMOKE_TOKEN_IN` — `USDC` or `EURC`, default `USDC`
- `AGFUSION_TESTNET_SMOKE_TOKEN_OUT` — `USDC` or `EURC`, default `EURC`

A pass means the configured endpoint returned an `ok: true` response with chain ID `5042002` and at least one prepared transaction. It does not broadcast the payload. Review any transaction separately in the app's explicit confirmation flow.
