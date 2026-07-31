# AGFusion — Deployed on Arc Testnet

## Custom contract (yours)

| Field | Value |
|-------|--------|
| **Contract** | `AGFusionRegistry` |
| **Address** | `0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483` |
| **Deployer / owner** | `0xB00f41172c23d31571a3bE850AA0e81e58Ab8828` |
| **Deploy tx** | `0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99` |
| **Chain** | Arc Testnet · `5042002` |
| **Metadata URI** | https://agfusion.vercel.app/identity/agfusion-agent.json |

### Explorer links

- Contract: https://testnet.arcscan.app/address/0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483  
- Deploy tx: https://testnet.arcscan.app/tx/0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99  
- Deployer: https://testnet.arcscan.app/address/0xB00f41172c23d31571a3bE850AA0e81e58Ab8828  

### Verify (if not already)

```powershell
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"
cd C:\Users\sayed\.grok\bin\agfusion\contracts
$ADDRESS = "0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483"
$URI = "https://agfusion.vercel.app/identity/agfusion-agent.json"
$args = cast abi-encode "constructor(string)" $URI
forge verify-contract $ADDRESS src/AGFusionRegistry.sol:AGFusionRegistry `
  --chain-id 5042002 `
  --verifier blockscout `
  --verifier-url https://testnet.arcscan.app/api/ `
  --constructor-args $args
```

### Register agent on your contract

```powershell
$REGISTRY = "0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483"
cast send $REGISTRY "register(string,string,string)" `
  "AGFusion Agent" "agent" "https://agfusion.vercel.app/identity/agfusion-agent.json" `
  --rpc-url https://rpc.testnet.arc.network `
  --private-key $env:PRIVATE_KEY
```

## App env

```ini
NEXT_PUBLIC_AGFUSION_REGISTRY=0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483
NEXT_PUBLIC_AGFUSION_DEPLOYER=0xB00f41172c23d31571a3bE850AA0e81e58Ab8828
NEXT_PUBLIC_AGFUSION_DEPLOY_TX=0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99
```

Defaults are also hard-coded in `src/lib/onchain.ts`.

## New product surfaces (2026-07)

| Feature | Where | Notes |
|---------|--------|--------|
| **Unified Balance deposit/spend** | Dashboard → Unified Balance | App Kit Gateway; deposit from Base/ETH Sepolia; spend on Arc |
| **ERC-8004 register** | Agents → Register on Arc | Live `IdentityRegistry.register` + metadata URI |
| **x402 risk oracle** | Dashboard → Route risk oracle | Pay 0.001 USDC → `/api/x402/risk-oracle` verifies + assesses |

ERC-8004 registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
