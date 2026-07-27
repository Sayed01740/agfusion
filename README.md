# AGFusion

**Stablecoin operations workspace on Arc** — payments, treasury, agents, and developer tooling.

Arc is Circle’s open Layer-1, the **Economic OS** for programmable money: USDC as gas, sub-second finality, EVM compatibility, and opt-in privacy.

---

## Public URL

See [docs/PUBLIC.md](./docs/PUBLIC.md) for the current tunnel / Vercel URL.

## Quick start

```bash
cd agfusion
npm install
cp .env.example .env
npx prisma db push
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000).

### Live path (required for money)

1. Connect a browser wallet → Arc Testnet (`5042002`)
2. Fund test USDC via [Circle Faucet](https://faucet.circle.com)
3. Send / transfer / agent **Confirm** → wallet signature
4. View settlement on [ArcScan](https://testnet.arcscan.app)

---

## Product modules

| Module | Description |
|--------|-------------|
| **Workspace** | Natural-language payments: estimate → confirm → settle on Arc |
| **Cross-chain transfer** | Move USDC across networks with progress and recovery |
| **Unified balance** | One spendable view across chains; pay on Arc |
| **Developer studio** | Snippets and Arc Build / Arc House documentation links |
| **Agents** | Policy-bound payroll, treasury, and FX agents (ERC-8004 patterns) |
| **Analytics** | Volume, success rate, and allocation |

---

## Arc resources

| Resource | URL |
|----------|-----|
| Arc homepage | [arc.io](https://www.arc.io) |
| Developer docs (Arc Build) | [docs.arc.io](https://docs.arc.io) |
| Arc House community | [community.arc.io](https://community.arc.io) |
| Arc Builders Fund | [Circle blog](https://www.circle.com/blog/introducing-the-arc-builders-fund) |
| Connect to Arc | [docs](https://docs.arc.io/arc/references/connect-to-arc) |
| Agentic economy | [docs](https://docs.arc.io/build/agentic-economy) |

### Network (Testnet)

- **Chain ID:** `5042002`
- **RPC:** `https://rpc.testnet.arc.network`
- **Explorer:** `https://testnet.arcscan.app`
- **Gas:** USDC (18 decimals)

---

## Stack

- Next.js 15 · React 19 · TypeScript · Tailwind 4 · Framer Motion · Zustand
- **viem** for Arc Testnet RPC and live sends
- Optional Circle payment tooling for multi-chain workflows
- Optional **LLM** for smarter agent replies / tool-calling (server-only):
  - **BazaarLink** (`BAZAARLINK_API_KEY=sk-bl-…`, default model `openai/gpt-4.1`)
  - or **xAI** (`XAI_API_KEY`)

## Production notes

| Pillar | Detail |
|--------|--------|
| Mode flags | `NEXT_PUBLIC_EXECUTION_MODE`, `NEXT_PUBLIC_ALLOW_DEMO` |
| Auth | SIWE + Prisma sessions |
| Agent | Tool-first loop; execute only after confirm |
| Staging | [docs/STAGING.md](./docs/STAGING.md) |

```bash
npx prisma db push
npm run build
```

## Agent (tool-first)

1. `get_wallet_state` + `get_balances`
2. `estimate_*`
3. `prepare_payment` → **Confirm**
4. `execute_*` only after confirm

- Streaming API: `POST /api/ai/agent` (SSE)
- Docs: [docs/AGENT.md](./docs/AGENT.md)
