# AGFusion — On-chain contracts & project identity (Arc Testnet)

## Important honesty

**AGFusion does not currently deploy its own app-specific Solidity contracts.**  
It is a **live app** that uses **Arc + Circle official contracts** (USDC, EURC, CCTP, App Kit bridge adapter, ERC-8004 registries).

Your **project blockchain identity** is:

1. **Owner wallet** = the Arc Testnet address you use to build/fund/demo (from Rabby)  
2. **Optional ERC-8004 agent NFT** = register AGFusion agent on Arc IdentityRegistry (see below)

---

## Network

| Field | Value |
|-------|--------|
| Network | Arc Testnet |
| Chain ID | `5042002` (`0x4cef52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Gas | USDC |

---

## Contracts AGFusion uses (official Arc / Circle)

### Stablecoins

| Asset | Address | Explorer |
|-------|---------|----------|
| **USDC** (native interface) | `0x3600000000000000000000000000000000000000` | [ArcScan](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |
| **EURC** | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | [ArcScan](https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a) |

### CCTP (bridge) — domain `26`

| Contract | Address |
|----------|---------|
| TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| MessageV2 | `0xbaC0179bB358A8936169a63408C8481D582390C4` |

### Gateway (unified balance style)

| Contract | Address |
|----------|---------|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

### Circle App Kit bridge (testnet EVM)

| Contract | Address |
|----------|---------|
| Bridge kit contract | `0xC5567a5E3370d4DBfB0540025078e283e36A363d` |

### ERC-8004 (agent identity) — for project agent registration

| Contract | Address |
|----------|---------|
| **IdentityRegistry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

Official refs:  
https://docs.arc.io/arc/references/contract-addresses  
https://docs.arc.io/arc/tutorials/register-your-first-ai-agent  

### AGFusion product surfaces (not contracts)

| Asset | URL |
|-------|-----|
| Live app | https://agfusion.vercel.app |
| Agent metadata JSON | https://agfusion.vercel.app/identity/agfusion-agent.json |
| X | https://x.com/AGfusion_ |

---

## Your project blockchain identity (from wallet)

Fill in after connecting Rabby on Arc:

| Field | Value |
|-------|--------|
| **Project name** | AGFusion |
| **Network** | Arc Testnet (`5042002`) |
| **Owner / deployer wallet** | `0xYOUR_WALLET` ← paste from Rabby |
| **Explorer (identity)** | `https://testnet.arcscan.app/address/0xYOUR_WALLET` |
| **Agent registry** | IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **Agent ID** | *(after you register — e.g. tokenId `42`)* |
| **Global agent key (ERC-8004 style)** | `eip155:5042002:0x8004A818BFB912233c491871b3d84c89A494BD9e` + agentId |
| **Metadata URI** | `https://agfusion.vercel.app/identity/agfusion-agent.json` |

---

## How to register on-chain identity (Rabby + ArcScan / viem)

1. Fund wallet with Arc Testnet USDC: https://faucet.circle.com  
2. Call **IdentityRegistry.register(string)** with metadata URI:  
   `https://agfusion.vercel.app/identity/agfusion-agent.json`  
3. Contract: `0x8004A818BFB912233c491871b3d84c89A494BD9e`  
4. After tx confirms, find **Transfer** event → **tokenId** = your **Agent ID**  
5. Public identity page: ArcScan for your wallet + registry + agentId  

Full tutorial: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent  

---

## Form-ready “Deployed contracts” block (copy-paste)

```
Network: Arc Testnet | Chain ID: 5042002

Project: AGFusion
App: https://agfusion.vercel.app
Owner wallet: 0xYOUR_WALLET

Contracts used (Circle / Arc official):
- USDC: 0x3600000000000000000000000000000000000000
- EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
- CCTP TokenMessengerV2: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
- CCTP MessageTransmitterV2: 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275
- App Kit Bridge (testnet): 0xC5567a5E3370d4DBfB0540025078e283e36A363d
- ERC-8004 IdentityRegistry: 0x8004A818BFB912233c491871b3d84c89A494BD9e

Agent metadata: https://agfusion.vercel.app/identity/agfusion-agent.json
Note: AGFusion is an application layer; settlement uses official Arc/Circle contracts.
```
