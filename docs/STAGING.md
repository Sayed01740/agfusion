# AGFusion — Staging & production deploy checklist

## Environments

| Env | Purpose | Demo money? | Chains |
|-----|---------|-------------|--------|
| **local** | Dev | Yes (`ALLOW_DEMO=true`) | Arc Testnet |
| **staging** | Arc team / beta | **No** (`ALLOW_DEMO=false`) | Arc Testnet |
| **production** | Real users | **No** | Arc mainnet when ready |

---

## Pre-deploy checklist

### Config

- [ ] `DATABASE_URL` set (Postgres on staging/prod)
- [ ] `NEXT_PUBLIC_EXECUTION_MODE=live`
- [ ] `NEXT_PUBLIC_ALLOW_DEMO=false` on staging/prod
- [ ] `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_APP_DOMAIN` match deploy host (SIWE)
- [ ] `NEXT_PUBLIC_SIWE_CHAIN_ID=5042002` (Testnet)
- [ ] Secrets only server-side: `XAI_API_KEY`, `KIT_KEY`, `DATABASE_URL`
- [ ] No private keys in env for browser

### Database

```bash
# Local
cp .env.example .env
npx prisma db push
npx prisma generate

# Staging Postgres
# set DATABASE_URL then:
npx prisma db push
# or prisma migrate deploy when you add migrations
```

### Build

```bash
npm ci
npm run build
npm start
# or vercel --prod
```

### Security smoke

- [ ] `POST /api/ai/agent` with `execute:true, confirmed:false` → **403**
- [ ] Spam agent → **429** after limit
- [ ] Invalid body → **400** with zod details
- [ ] Connect wallet → SIWE sign → `/api/auth/me` authenticated
- [ ] Tx after execute appears in `/api/transactions` when DB on
- [ ] Live send requires wallet signature (not fake success when ALLOW_DEMO=false)

### Product smoke (Arc Testnet)

1. Landing loads  
2. Dashboard agent: balances tool trace  
3. Plan + Confirm for pay flow  
4. Wallet connect + SIWE  
5. Small live send + ArcScan link  
6. Studio code gen  
7. Force demo hidden/disabled when `ALLOW_DEMO=false`

### Ops

- [ ] Error tracking (Sentry) wired  
- [ ] Uptime check on `/api/config`  
- [ ] Log retention for `AgentRun`  
- [ ] Incident runbook owner named  

---

## Vercel

1. Import Git repo  
2. Root: `agfusion`  
3. Env vars from `.env.staging.example`  
4. Build: `prisma generate && next build` (via `npm run build`)  
5. Add Postgres (Vercel Postgres / Neon / Supabase)  
6. Run `prisma db push` against staging URL once  

```bash
npx vercel env pull
npx prisma db push
```

---

## Production policy (already in code)

| Control | Implementation |
|---------|----------------|
| Execution mode | `src/lib/config.ts` |
| No demo success in live-only | `assertDemoAllowed` in `appkit-service.ts` |
| Confirm gate | `execute` requires `confirmed` in agent API |
| Rate limit | `src/lib/rate-limit.ts` |
| Validation | `src/lib/validation.ts` (zod) |
| Auth | SIWE `/api/auth/*` |
| Tx durability | Prisma `Transaction` + `/api/transactions` |
| Sanitize agent HTML | `src/lib/sanitize.ts` |

---

## Go / no-go for Arc Testnet “staging production”

**Go** when:

1. Staging URL public, HTTPS  
2. SIWE works on that domain  
3. Agent 403/429 tests pass  
4. At least one live send with explorer link  
5. `ALLOW_DEMO=false` and no false “live” labels on simulations  
6. DB persists transactions for signed-in users  

**No-go** if demo simulations can be labeled live, or execute works without confirm.

---

## Rollback

1. Redeploy previous Vercel deployment  
2. Keep DB (forward-compatible schema)  
3. Feature-flag: set `NEXT_PUBLIC_EXECUTION_MODE=demo` only on emergency staging — never on public prod without disclosure  
