# Path A — Deploy AGFusionRegistry with Foundry (Arc Testnet)

## Status on this machine

- [x] Foundry installed (`%USERPROFILE%\.foundry\bin`)
- [x] `forge-std` vendored under `lib/forge-std`
- [x] Local tests pass (`forge test`)
- [ ] You fund wallet + set `PRIVATE_KEY` + run `deploy.ps1`
- [ ] You save deployed address + verify on ArcScan

## 1. One-time PATH (PowerShell)

```powershell
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"
forge --version
```

(Optional permanent: add `%USERPROFILE%\.foundry\bin` to Windows PATH.)

## 2. Fund deployer wallet

1. In Rabby, copy your Arc Testnet address  
   **or** create a deploy key:
   ```powershell
   cast wallet new
   ```
2. Faucet → **Arc Testnet** → USDC: https://faucet.circle.com  
3. Confirm balance:
   ```powershell
   cast balance 0xYOUR_ADDRESS --rpc-url https://rpc.testnet.arc.network
   ```
   Must be **> 0** (native USDC gas on Arc).

## 3. Deploy (this session only)

```powershell
cd C:\Users\sayed\.grok\bin\agfusion\contracts
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"

# NEVER commit this. NEVER paste into chat.
$env:PRIVATE_KEY = "0xYOUR_PRIVATE_KEY"
$env:ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network"
$env:AGFUSION_METADATA_URI = "https://agfusion.vercel.app/identity/agfusion-agent.json"

.\deploy.ps1
```

Look for:

```text
AGFusionRegistry deployed at: 0x...
```

Save that address.

## 4. Verify source on ArcScan

```powershell
$ADDRESS = "0xYOUR_DEPLOYED_ADDRESS"
$URI = "https://agfusion.vercel.app/identity/agfusion-agent.json"
$args = cast abi-encode "constructor(string)" $URI

forge verify-contract $ADDRESS src/AGFusionRegistry.sol:AGFusionRegistry `
  --chain-id 5042002 `
  --verifier blockscout `
  --verifier-url https://testnet.arcscan.app/api/ `
  --constructor-args $args
```

Open: `https://testnet.arcscan.app/address/0xYOUR_DEPLOYED_ADDRESS`

## 5. Register AGFusion agent on your contract

```powershell
$REGISTRY = "0xYOUR_DEPLOYED_ADDRESS"
cast send $REGISTRY "register(string,string,string)" `
  "AGFusion Agent" "agent" "https://agfusion.vercel.app/identity/agfusion-agent.json" `
  --rpc-url https://rpc.testnet.arc.network `
  --private-key $env:PRIVATE_KEY
```

## 6. Read project identity

```powershell
cast call $REGISTRY "projectInfo()(string,string,address,string,bool,uint256)" `
  --rpc-url https://rpc.testnet.arc.network
```

## 7. Tell AGFusion app

Vercel → Environment Variables:

```ini
NEXT_PUBLIC_AGFUSION_REGISTRY=0xYOUR_DEPLOYED_ADDRESS
```

Then redeploy the Next app (optional wiring next).

## Form paste after deploy

```
Project: AGFusion
Network: Arc Testnet (5042002)
Owner / deployer: 0xYOUR_WALLET
Custom contract: AGFusionRegistry @ 0xYOUR_DEPLOYED_ADDRESS
Explorer: https://testnet.arcscan.app/address/0xYOUR_DEPLOYED_ADDRESS
Metadata: https://agfusion.vercel.app/identity/agfusion-agent.json
```

## Security

- Private key stays in your terminal only  
- Prefer a **dedicated test deploy wallet**  
- Revoke/clear `$env:PRIVATE_KEY` after deploy:
  ```powershell
  Remove-Item Env:PRIVATE_KEY
  ```
