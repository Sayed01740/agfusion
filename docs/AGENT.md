# AGFusion Agent Loop

## Flow

```
User → /api/ai/agent (SSE)
     → get_wallet_state + get_balances
     → estimate_*
     → prepare_payment → UI Confirm gate
     → execute_* (only if confirmed)
     → transaction + tool trace
```

## Files

| File | Role |
|------|------|
| `src/ai/tools.ts` | Tool definitions + `executeTool` |
| `src/ai/agent-loop.ts` | Local planner (no LLM required) |
| `src/ai/agent-llm.ts` | Optional BazaarLink / xAI function-calling |
| `src/lib/llm-config.ts` | Provider resolution (`BAZAARLINK_*` → `XAI_*`) |
| `src/app/api/ai/agent/route.ts` | SSE + JSON agent API |
| `src/lib/agent-client.ts` | Browser stream client |
| `src/components/ai/chat-panel.tsx` | Live status + tool trace UI |

## Rules

1. **Observe before act** — balances + wallet first for money intents  
2. **Estimate before confirm** — fees/ETA shown in plan  
3. **No money without confirm** — `execute_*` blocked unless `confirmed`  
4. **Never invent tx hashes** — only from tool results  
5. **LLM optional** — set `BAZAARLINK_API_KEY` (preferred) or `XAI_API_KEY` for tool-calling; else local tools  

## SSE events

`status` · `tool` · `confirm` · `message` · `transaction` · `done` · `error`

## Try

```
Show my balances across chains
Move $100 to Arc and pay Sarah   → Confirm & execute
Generate App Kit bridge code
```
