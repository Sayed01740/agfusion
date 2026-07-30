# ⚡ AGFusion: Autonomous Stablecoin OS on Arc

**AGFusion** is a next-generation stablecoin operations workspace built natively on **Arc Network**. It leverages intelligent agents to orchestrate complex natural-language payments, unified cross-chain balances, and treasury management—settling seamlessly with sub-second finality using USDC as gas.

🔗 **Live Demo:** [https://agfusion.vercel.app](https://agfusion.vercel.app)
🐦 **X / Twitter:** [Follow @AGfusion_](https://x.com/AGfusion_) 
---

## 🏆 Why We Built on Arc

Arc is Circle’s open Layer-1, the **Economic OS** for programmable money. We chose Arc because it natively supports:
- **Unified Balances:** AGFusion uses the **Unified Balance Kit** to automatically allocate cross-chain spends using greedy optimization, allowing users to spend across Ethereum, Base, Avalanche, and Arc without worrying about bridging.
- **USDC as Gas:** frictionless user onboarding without needing native volatile tokens.
- **Sub-Second Finality:** critical for our AI-agent-driven payment orchestration.
- **Opt-in Privacy:** preparing for future enterprise treasury use-cases.

## 🚀 Deployed on Arc Testnet

AGFusion's smart contract infrastructure is fully deployed and verified on the Arc Testnet.
- **Network:** Arc Testnet (`5042002`)
- **RPC:** `https://rpc.testnet.arc.network`
- **AGFusionRegistry Contract:** `0x76bb5678ec11ae94b34ed9cf90b25c9eea440483`
- **Explorer:** [View on ArcScan](https://testnet.arcscan.app/address/0x76bb5678ec11ae94b34ed9cf90b25c9eea440483)

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS 4, Framer Motion
- **Blockchain / Wallets:** Arc AppKit, Unified Balance Kit, `viem`, SIWE (Sign-In With Ethereum)
- **AI Agents:** Integrated with BazaarLink / xAI for intent parsing and transaction staging
- **Database:** Prisma with Serverless PostgreSQL
- **Smart Contracts:** Foundry (Solidity)

---

## ⚙️ Quick Start (Local Development)

```bash
git clone https://github.com/Sayed01740/agfusion.git
cd agfusion
npm install

# Setup environment variables
cp .env.example .env

# Initialize database
npx prisma db push

# Build and Run
npm run build
npm run start
```
Open [http://localhost:3000](http://localhost:3000).

### Interacting with the App
1. Connect your wallet (e.g., Rabby or MetaMask) and switch to **Arc Testnet (`5042002`)**.
2. Fund your wallet with test USDC via the [Circle Faucet](https://faucet.circle.com).
3. Use the AGFusion AI Workspace to issue natural language commands (e.g., *"Pay 100 USDC to John"*).
4. The AI estimates fees, prepares the batched transaction using Arc AppKit, and waits for your confirmation.

---

## 🧠 AI Agent Architecture (Tool-First)

AGFusion agents follow a strict "Trust but Verify" execution loop:
1. `get_wallet_state` + `get_balances`
2. `estimate_fees`
3. `prepare_payment` → **Stops and requires explicit User Confirmation**
4. `execute_transfer` → **Executed via Arc Network**

## 📚 Arc Resources We Used

- [Arc Developer Docs](https://docs.arc.io)
- [Unified Balance AppKit](https://docs.arc.io/app-kit/unified-balance)
- [Arc Builders Fund](https://www.circle.com/blog/introducing-the-arc-builders-fund)
