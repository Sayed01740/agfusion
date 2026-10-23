# AGFusion custom contracts (Arc Testnet)

This folder contains **AGFusion’s own Solidity** — separate from Circle USDC / CCTP / App Kit contracts.

## Contract

| Contract | Purpose |
|----------|---------|
| `AGFusionRegistry` | On-chain project identity + module/agent registrations |

## Prerequisites

1. **Foundry** — https://getfoundry.sh  
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```
   On Windows: use **WSL** or install Foundry for Windows.

2. **Wallet with Arc Testnet USDC** (gas)  
   - Faucet: https://faucet.circle.com  
   - Chain ID: `5042002`  
   - RPC: `https://rpc.testnet.arc.network`

3. **Never commit private keys**

## One-time setup

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
```

Create `contracts/.env` (gitignored):

```ini
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_FROM_RABBY_EXPORT
AGFUSION_METADATA_URI=https://agfusion.vercel.app/identity/agfusion-agent.json
```

## Test locally

```bash
forge test -vv
```

## Arc Mainnet deployment (Chain ID 5042)

**Do not broadcast these scripts until the contracts have passed independent
review, Foundry tests, and a documented deployment approval.** These scripts
are chain-guarded but the guard does not replace a security audit or multisig
review. Never send private keys in chat or commit them to Git.

Configure these values locally in a secure shell or secret manager:

```bash
export ARC_MAINNET_RPC_URL="https://rpc.mainnet.arc.io"
export PRIVATE_KEY="0x<MAINNET_DEPLOYER_KEY>"
export AGFUSION_METADATA_URI="https://<approved-domain>/identity/agfusion-agent.json"
export AGFUSION_OWNER="0x<reviewed-multisig-address>"
export AGFUSION_ARBITRATOR="0x<reviewed-arbitrator-or-multisig>"
export AGFUSION_FEE_RECIPIENT="0x<approved-treasury-address>"
export AGFUSION_ESCROW_FEE_BPS="50"
```

Run a read-only network preflight from the repository root before deployment:

```bash
npm run verify:arc-mainnet
```

After approval, the Mainnet-specific scripts enforce `block.chainid == 5042`:

```bash
cd contracts
forge script script/DeployAGFusionRegistryMainnet.s.sol:DeployAGFusionRegistryMainnet --rpc-url "$ARC_MAINNET_RPC_URL" --chain-id 5042 --private-key "$PRIVATE_KEY" --broadcast -vvvv
forge script script/DeployAGFusionEscrowMainnet.s.sol:DeployAGFusionEscrowMainnet --rpc-url "$ARC_MAINNET_RPC_URL" --chain-id 5042 --private-key "$PRIVATE_KEY" --broadcast -vvvv
forge script script/DeployAGFusionDisperseMainnet.s.sol:DeployAGFusionDisperseMainnet --rpc-url "$ARC_MAINNET_RPC_URL" --chain-id 5042 --private-key "$PRIVATE_KEY" --broadcast -vvvv
```

Record each deployed address and transaction hash, verify the deployed bytecode
and constructor/ownership settings, and only then configure the corresponding
Mainnet environment variables in an isolated Vercel deployment. Do not overwrite
the existing Testnet environment or reuse Testnet contract addresses.

## Deploy to Arc Testnet (Chain ID 5042002)

```bash
# PowerShell
$env:ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
$env:PRIVATE_KEY="0x..."
$env:AGFUSION_METADATA_URI="https://agfusion.vercel.app/identity/agfusion-agent.json"

forge script script/DeployAGFusionRegistry.s.sol:DeployAGFusionRegistry `
  --rpc-url $env:ARC_TESTNET_RPC_URL `
  --broadcast `
  -vvvv
```

Or bash:

```bash
source .env
forge script script/DeployAGFusionRegistry.s.sol:DeployAGFusionRegistry \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  -vvvv
```

Save the printed address:

```text
AGFusionRegistry deployed at: 0x...
```

## Verify on Arc Explorer

```bash
forge verify-contract 0xYOUR_DEPLOYED_ADDRESS src/AGFusionRegistry.sol:AGFusionRegistry \
  --chain-id 5042 \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api/ \
  --constructor-args $(cast abi-encode "constructor(string)" "https://agfusion.vercel.app/identity/agfusion-agent.json")
```

## Register the main agent on-chain (after deploy)

```bash
cast send $REGISTRY "register(string,string,string)" \
  "AGFusion Agent" "agent" "https://agfusion.vercel.app/identity/agfusion-agent.json" \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

## Read project info

```bash
cast call $REGISTRY "projectInfo()(string,string,address,string,bool,uint256)" \
  --rpc-url $ARC_TESTNET_RPC_URL
```

## After deploy — update AGFusion app

Put the address in Vercel env / docs:

```ini
NEXT_PUBLIC_AGFUSION_REGISTRY=0xYourDeployedAddress
```

Then wire the Agents page / identity UI to call `projectInfo()` and `register()`.

## Official Arc guide

https://docs.arc.io/arc/tutorials/deploy-on-arc
