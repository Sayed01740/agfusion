# AGFusion

**AGFusion** is an AI-native stablecoin operations workspace built on Arc Network. It brings payments, balances, treasury workflows, and cross-chain settlement into a single interface, with explicit user confirmation before on-chain execution.

> **Status:** Active development on Arc Testnet.

## Overview

AGFusion is designed to make stablecoin operations easier to understand and safer to execute. The application combines a modern web interface with blockchain infrastructure, policy checks, transaction preparation, and an AI-assisted command layer.

### Core capabilities

- Natural-language payment and treasury workflows
- Unified cross-chain balance views
- USDC payments and settlement on Arc
- Cross-chain bridging and swap flows
- Wallet authentication with SIWE
- Circle Programmable Wallet integrations
- Transaction previews and explicit confirmation gates
- Agent spending policies, rate limits, and validation
- Persistent transaction and bridge state
- Analytics and operational diagnostics

## Architecture

```text
Web UI (Next.js / React)
        |
        +--> Authentication & Session Layer
        |
        +--> AI Command / Intent Layer
        |        |
        |        +--> Policy & Validation
        |        +--> Transaction Planning
        |        +--> User Confirmation
        |
        +--> Blockchain Services
        |        |
        |        +--> Arc App Kit
        |        +--> Circle CCTP / Bridge Services
        |        +--> Wallet Adapters
        |        +--> RPC / On-chain Verification
        |
        +--> Persistence
                 |
                 +--> Prisma / PostgreSQL
```

The AI layer prepares and validates actions. It does not receive authority to silently execute transactions. On-chain execution remains behind application policy checks and an explicit confirmation step.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, Tailwind CSS 4, Framer Motion |
| Language | TypeScript |
| Blockchain | Arc Network, viem, Circle App Kit |
| Wallets | Circle Programmable Wallets, wallet adapters, ZeroDev integrations |
| AI | Server-side LLM integrations with intent parsing and tool orchestration |
| Database | Prisma with PostgreSQL-compatible storage |
| Contracts | Solidity |
| Testing | Vitest, TypeScript, ESLint |
| Deployment | Vercel |

## Arc Testnet

AGFusion currently targets **Arc Testnet**.

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- AGFusionRegistry: `0x76bb5678ec11ae94b34ed9cf90b25c9eea440483`
- Explorer: https://testnet.arcscan.app/address/0x76bb5678ec11ae94b34ed9cf90b25c9eea440483

Public blockchain addresses and network endpoints are not credentials. Private keys, API keys, database credentials, signing secrets, and other authentication material must never be committed to this repository.

## Local development

### Requirements

- Node.js 22
- npm 10+
- A PostgreSQL-compatible database for production-like development
- Arc Testnet wallet and test USDC when exercising live flows

### Setup

```bash
git clone https://github.com/Sayed01740/agfusion.git
cd agfusion
npm install
cp .env.example .env
```

Fill in the required server-side environment variables locally, then initialize the database:

```bash
npx prisma db push
npm run dev
```

For a production build:

```bash
npm run build
npm run start
```

Never place real credentials in `.env.example`, source files, test fixtures, documentation, screenshots, or commit messages.

## Environment configuration

Environment templates are provided for local and staging-style development. Real secrets belong only in the deployment environment or a local ignored `.env` file.

Important server-side values include:

- `DATABASE_URL`
- `AUTH_SECRET`
- `CIRCLE_API_KEY`
- LLM provider credentials
- `KIT_KEY` where required by the active integration

Variables prefixed with `NEXT_PUBLIC_` are intended for browser-visible configuration only. Do not put secrets in them.

## Security model

AGFusion follows a server-side secret boundary:

1. Credentials are loaded from environment variables.
2. Server-only integrations keep provider secrets out of browser bundles.
3. User actions are validated before execution.
4. High-impact operations require explicit confirmation.
5. Rate limits and spending limits reduce automated abuse.
6. Transaction state is persisted and verified before finalization.

If a credential is ever exposed, assume it is compromised. Revoke or rotate it at the provider immediately, then remove it from the repository and its history as appropriate.

## Repository structure

```text
src/
├── ai/             AI intent, orchestration, and tool execution
├── app/            Next.js routes, pages, and API endpoints
├── blockchain/     Arc, bridge, swap, and transaction services
├── components/     UI and product components
├── contracts/      Solidity contracts
├── lib/            Shared services, persistence, validation, and utilities
├── providers/      React application providers
├── sdk/            Wallet and account abstractions
├── store/          Client-side state
└── types/          Shared TypeScript types

prisma/              Database schema
docs/                Product and architecture documentation
public/              Brand and static assets
scripts/             Build and maintenance utilities
```

## Useful commands

```bash
npm run dev        # Start development server
npm run build      # Create production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript checks
npm test           # Run Vitest
npm run db:push    # Apply Prisma schema to the configured database
```

## Contributing

Keep changes focused, avoid committing generated or machine-specific files, and never commit credentials. Before opening a pull request, run the relevant type checks, tests, and production build.

## License

This repository is currently maintained as an active AGFusion project. Licensing and public release terms may change as the project evolves.

## Links

- Live application: https://agfusion.vercel.app
- Arc documentation: https://docs.arc.io
- Arc Testnet explorer: https://testnet.arcscan.app
