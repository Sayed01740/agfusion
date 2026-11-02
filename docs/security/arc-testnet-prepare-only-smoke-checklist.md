# Arc Testnet prepare-only smoke checklist

## Safety boundary

This checklist verifies request validation, quote/route preparation, and read-only RPC behavior only. It must not sign, approve, submit, or broadcast any transaction. Do not use a wallet private key, seed phrase, production credential, or Mainnet RPC for these checks.

## Preflight

- [ ] Confirm the test target is the Arc Testnet preview/local environment, not production.
- [ ] Confirm `NEXT_PUBLIC_ARC_NETWORK` is not set to `mainnet`.
- [ ] Confirm `NEXT_PUBLIC_ARC_CHAIN_ID` is not `5042` and `NEXT_PUBLIC_ARC_CHAIN_HEX` is not `0x13b2`.
- [ ] Confirm the intended chain is Arc Testnet, chain ID `5042002` (`0x4cef52`).
- [ ] Use a test-only Circle App Kit key and a test wallet address. Never paste secrets into logs or test output.
- [ ] Record the commit SHA and the Preview URL being tested.

## Read-only RPC checks

- [ ] Call `GET /api/rpc?chain=arc` and verify the returned chain ID is `0x4cef52`.
- [ ] Send a read-only `eth_blockNumber` request and verify a valid JSON-RPC response.
- [ ] Send a read-only `eth_chainId` request and verify `0x4cef52`.
- [ ] Confirm no wallet prompt appears and no transaction method such as `eth_sendTransaction` or `eth_sendRawTransaction` is called.

## Quote / prepare checks

Use only the swap preparation endpoint, with an explicit Arc Testnet chain ID:

```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "amount": "1",
  "tokenIn": "USDC",
  "tokenOut": "EURC",
  "chainId": 5042002
}
```

The address above is a placeholder; replace it with a test wallet address only if the test environment requires an address owned by the tester.

- [ ] Confirm invalid wallet address returns `400`.
- [ ] Confirm zero, negative, malformed, or non-finite amounts return `400`.
- [ ] Confirm unsupported token pairs and unsupported chain IDs return `400`.
- [ ] Confirm a valid Testnet request either returns a quote/prepared transaction payload or a documented upstream/configuration error.
- [ ] If a prepared transaction payload is returned, inspect only its chain context, token pair, amount, recipient/contract targets, and fee/estimate fields. Do not sign or submit it.
- [ ] Confirm the response chain ID matches the explicit request chain ID `5042002`.
- [ ] Confirm no transaction hash is created and no wallet signature or broadcast occurs.

## Body-limit regression checks

- [ ] Oversized Circle swap prepare JSON returns `413` before Circle App Kit initialization.
- [ ] Non-object JSON (for example `[]`) returns `400`.
- [ ] Oversized RPC body returns `413` without forwarding to an upstream.
- [ ] Valid in-limit JSON-RPC read request is forwarded unchanged.

## Evidence and stop conditions

- [ ] Record HTTP status, redacted response shape, chain ID, commit SHA, and timestamps.
- [ ] Never record API keys, access tokens, signatures, private keys, seed phrases, or personally identifying wallet ownership data.
- [ ] Stop immediately if the endpoint resolves to Mainnet, the chain ID is not `5042002`, a wallet signing prompt appears, or a transaction is submitted.
- [ ] A successful prepare-only check is not evidence that signing, allowance, execution, settlement, or production readiness is safe.
