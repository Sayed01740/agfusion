# AGFusion dApp — Unified Swap / Send / Bridge / Batch

A dark, Uniswap-style trading surface that is now the **landing page** (`/`) of AGFusion.
It unifies four money actions on **Arc Testnet** into one card:

| Tab | What it does | Underlying path |
|-----|--------------|-----------------|
| **Swap** | Quote + swap between stablecoins | Live Arc Uniswap-V2 router (`getArcDexSwapQuote` → `executeSwap`) |
| **Send** | Single ERC-20 transfer | `sendArcToken` (canonical `transfer`, explicit gas) |
| **Bridge** | Cross-chain USDC (Arc ↔ Base Sepolia) | Circle CCTP (`executeBridge`) |
| **Batch** | Pay many recipients | `AGFusionDisperse.disperseToken` — **one signature** |

The previous marketing page moved to **`/welcome`** (linked from the card footer and the mobile nav).

---

## Money-safety model (unchanged)

The user's in-browser wallet is the **sole signer**. There is no server-side signing key. Every
action is built client-side and submitted through the connected injected provider (Rabby, MetaMask,
Coinbase, Brave, or a Circle Email Wallet). Reads go through the same-origin `/api/rpc?chain=arc`
proxy so a flaky public RPC can't surface as a false "network error".

The batch flow uses at most **one token approval** (max-allowance, only if the current allowance is
short) plus **one** `disperseToken` call. The Disperse contract is non-custodial: it pulls exactly
`sum(values)` from the sender via `transferFrom` and forwards each amount in the same transaction. It
never holds balances and is reentrancy-guarded.

---

## Files

**On-chain (Foundry, `contracts/`)**

```
src/AGFusionDisperse.sol                    # batch send: disperseToken / disperseTokenEqual / disperseNative
script/DeployAGFusionDisperse.s.sol         # deploy script (prints the address to set in env)
test/AGFusionDisperse.t.sol                 # unit tests (split, equal, native+refund, no-return tokens, reverts)
```

**Client (`src/`)**

```
lib/dapp/tokens.ts            # Arc token registry (USDC/EURC/cirBTC), bridge routes, DISPERSE_ADDRESS + isDisperseConfigured()
lib/dapp/erc20.ts             # ERC-20 ABI, arcPublicClient(), balance/allowance reads, encodeApprove()
lib/dapp/send.ts              # sendArcToken() — generic single transfer
lib/dapp/disperse.ts          # runBatchDisperse() (single-signature) + validateBatch()
components/dapp/shared.tsx     # useArcBalance, TokenSelect, AmountField, StepList, ResultBanner, ErrorNote
components/dapp/swap-card.tsx  # debounced live quote + swap
components/dapp/send-card.tsx  # single send
components/dapp/bridge-card.tsx# route picker + CCTP bridge
components/dapp/batch-card.tsx # recipient rows + single-signature disperse (sequential fallback)
components/dapp/agfusion-dapp.tsx # container: tabs + wallet header + wrong-network switch
app/page.tsx                   # renders <AGFusionDapp /> (the new landing page)
app/welcome/page.tsx           # the former marketing landing page
```

Everything reuses the existing wallet stack (`src/providers/wallet-provider.tsx` → `useWallet()`,
`src/store/pilot-store.ts` for `walletAddress` / `walletChainId`), so connect, network-switch,
balances, and transaction history all continue to work exactly as before.

---

## The single-signature batch (headline feature)

`AGFusionDisperse` enables paying an arbitrary list of recipients in **one** on-chain transaction.

```solidity
disperseToken(IERC20 token, address[] recipients, uint256[] values)
```

Steady-state cost is **one signature** (the max-allowance approval is a one-time prerequisite the
first time a token is used with the contract; after that only the single `disperseToken` call is
signed).

### Enabling it

The UI reads `NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS`. Until it is set, the Batch tab shows an
amber **"One confirm each"** badge and safely **falls back to sequential sends** (one wallet
confirmation per recipient). Once the contract is deployed and the env var is set, the badge turns
green (**"Single signature"**) and the whole batch is a single `disperseToken` call.

```ini
# .env.local
NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS=0xYourDeployedDisperseAddress
```

---

## Deploy the Disperse contract (Arc Testnet)

Foundry can't run inside the app sandbox — run these on your machine (WSL/macOS/Linux).

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit   # if not already installed

# 1. Test
forge test -vv --match-contract AGFusionDisperse

# 2. Deploy (key passed on CLI; never commit it)
forge script script/DeployAGFusionDisperse.s.sol:DeployAGFusionDisperse \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key 0xYOUR_KEY \
  --broadcast -vvvv
```

PowerShell:

```powershell
cd contracts
$env:PRIVATE_KEY="0x..."
forge script script/DeployAGFusionDisperse.s.sol:DeployAGFusionDisperse `
  --rpc-url https://rpc.testnet.arc.network `
  --private-key $env:PRIVATE_KEY `
  --broadcast -vvvv
```

Copy the printed `AGFusionDisperse deployed at: 0x...` into `NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS`,
then restart `next dev` so the env var is picked up.

---

## Run & verify the app locally

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm run dev           # http://localhost:3000  → the new dApp landing page
npm run build         # production build (prisma generate && next build)
```

Smoke test:

1. Open `/`, click **Connect**, approve in your wallet, confirm the chip shows your address and Arc.
2. **Swap** a small amount USDC → EURC (watch the live quote + min-received).
3. **Send** a token to a second address.
4. **Batch**: add 2–3 recipients. Without the contract you'll get one confirmation each; with it set,
   a single signature.
5. **Bridge** a small USDC amount Arc → Base Sepolia (CCTP takes a few minutes to finalize).

---

## Notes & tradeoffs

- **Swap** intentionally reuses the already-proven live Arc V2 router rather than deploying a new
  AMM, so quotes and execution match the rest of the app.
- **Bridge** is USDC-only by design (CCTP). The card locks the token to USDC.
- `cirBTC` appears in the swap token list; if no on-chain pair exists the card just shows
  "No route available" — no unsafe fallback.
- Gas is set explicitly on writes (Arc's `eth_estimateGas` is unreliable for token writes):
  `transfer` 100k, `approve` 90k, `disperseToken` ≈ 120k + 48k·recipients.
