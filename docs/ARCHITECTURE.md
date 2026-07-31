# AGFusion — Architecture

## Agent loop

See [AGENT.md](./AGENT.md). Command Center uses tool-first streaming:

`get_wallet_state` → `get_balances` → `estimate_*` → `prepare_payment` → **Confirm** → `execute_*`

## Philosophy

Users interact with **money + AI**. Chains, bridges, gas, routing, and liquidity stay invisible. The product is an AI-native stablecoin OS on Arc, not a generic crypto dashboard.

## System diagram

```
┌─────────────┐     NL intent      ┌──────────────────┐
│  Chat UI    │ ─────────────────► │ AI Orchestrator  │
│  Dashboard  │                    │ parse + preview  │
└──────┬──────┘                    └────────┬─────────┘
       │                                    │
       │ confirm                            │ execute
       ▼                                    ▼
┌─────────────┐                    ┌──────────────────┐
│ Action APIs │ ◄───────────────── │ App Kit Service  │
│ bridge/swap │                    │ demo or live SDK │
│ send/AI     │                    └────────┬─────────┘
└─────────────┘                             │
                                            ▼
                                   ┌──────────────────┐
                                   │ Circle App Kit   │
                                   │ CCTP / Unified $ │
                                   │ Arc Testnet      │
                                   └──────────────────┘
```

## Layers

### 1. Presentation (`src/app`, `src/components`)

- Landing (cinematic demo narrative)
- Command Center (chat + balances + panels)
- Studio (code gen + deploy assistant)
- Analytics (Recharts)
- Agents (ERC-8004-style registry)

### 2. AI (`src/ai`)

- `intent.ts` — deterministic NLU (amount, chain, recipient, code topic)
- `orchestrator.ts` — maps intent → previews, narratives, code blocks, execution
- `/api/ai/chat` — optional xAI (`grok-4.5`) polish when `XAI_API_KEY` is set

### 3. Blockchain (`src/blockchain`, `src/sdk`)

- High-fidelity demo flows mirror CCTP steps: approve → burn → attestation → mint
- Live path via dynamic `AppKit` load when `@circle-fin/app-kit` is installed + wallet adapter wired

### 4. State (`src/store`)

- Zustand `usePilotStore` — messages, transactions, unified balances, wallet demo flag

## App Kit surface area

| Capability | Method | Status in repo |
|------------|--------|----------------|
| Bridge | `kit.bridge` | Demo + live stub |
| Estimate bridge | `kit.estimateBridge` | Demo estimate |
| Swap | `kit.swap` | Demo + live stub |
| Send | `kit.send` | Demo + live stub |
| Unified balance | `kit.unifiedBalance.*` | Templates + narrative |
| Events | `kit.on('bridge.*')` | Documented |
| Recovery | `kit.retryBridge` | Documented / Studio |

## Security

- Secrets only server-side (`XAI_API_KEY`, `KIT_KEY`)
- Confirm-before-execute on AI action previews
- Demo mode default until real wallet connection

## Extending to production

1. Install `@circle-fin/app-kit`, `@circle-fin/adapter-viem-v2`, `viem`
2. Wire Viem adapter from connected wallet
3. Replace demo balance snapshot with `unifiedBalance` reads
4. Persist txs (Postgres + Prisma) and add Redis rate limits
5. Connect Arc MCP for Studio doc search
