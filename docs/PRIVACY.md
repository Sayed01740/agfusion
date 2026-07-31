# AGFusion — privacy & exposure controls

## What is public vs private

| Surface | Exposed? | Notes |
|---------|----------|--------|
| Product name / network label | Yes | Needed for branding |
| Wallet address (in your browser) | Local only | Not listed without SIWE session |
| Your txs via API | **Session only** | Requires sign-in |
| RPC URL / chain hex | **Collapsed** in UI | Only under “Network details” |
| Tool names / summaries | **Redacted** | Agent SSE omits summaries |
| Zod validation details | **No** | Generic `invalid_request` |
| DB / Prisma status | **No** | Removed from `/api/config` and `/api/auth/me` |
| Error stacks | **No** | Generic client messages |
| Source maps | **No** | `productionBrowserSourceMaps: false` |
| `X-Powered-By` | **No** | Disabled |

## Public API surface

- `GET /api/config` → `{ product, network, liveOnly }`
- `GET /api/auth/me` → `{ authenticated }` or `{ authenticated, user: { address } }`
- `GET /api/balances` → empty without session
- `GET /api/transactions` → only signed-in user’s txs
- `POST /api/ai/agent` → rate limited; redacted stream; confirm gate

## Secrets (server only — never `NEXT_PUBLIC_`)

- `XAI_API_KEY`
- `KIT_KEY`
- `DATABASE_URL`

## Cloudflare tunnel / demos

Quick tunnels are temporary and still hit **your** machine. Prefer Vercel + env lockdown for real public demos.
