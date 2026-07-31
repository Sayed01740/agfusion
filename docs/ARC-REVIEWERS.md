# AGFusion — Notes for Arc / Arc House reviewers

## One-liner

**AGFusion is the AI-native command layer for stablecoin finance on Arc:** natural language → fee estimate → confirm → live wallet signature (Circle App Kit bridge/swap + native Arc USDC send).

**Live demo:** https://agfusion.vercel.app  
**X:** https://x.com/AGfusion_

## Honest model (live-only)

| Capability | Status |
|------------|--------|
| Wallet connect + Arc Testnet (5042002) | **Live** — EIP-6963, Rabby sticky |
| AI agent plan + Confirm card | **Live plan** — never signs without you |
| Send USDC on Arc | **Live** — native USDC (18 dec) via viem / App Kit |
| Swap USDC ↔ EURC | **Live** — Circle App Kit + kit key |
| Bridge Arc ↔ Base (CCTP) | **Live** — App Kit bridge + server RPC proxy |
| Unified balance deposit/spend | **Live path** when App Kit supports it; spend needs real 0x |
| Balances UI / agent | **Live Arc RPC only** — no fake multi-chain demo portfolio |
| Agents page escrow phases | **Simulated UI** + optional **live 1 USDC** payout to your address |
| Studio deploy assistant | **Local simulation** — send/swap/bridge snippets are live |

Every transaction records `executionMode: "live"`. Demo money paths are disabled.

## Arc Testnet

| Field | Value |
|-------|--------|
| Chain ID | `5042002` (`0x4cef52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Gas | USDC (18 decimals) |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |

Health: https://agfusion.vercel.app/api/rpc?chain=arc → `ok: true`

## 10-minute review path (recommended)

1. Open https://agfusion.vercel.app/dashboard  
2. **Connect** Rabby → **Arc Testnet**  
3. Fund test USDC: https://faucet.circle.com  
4. **Payment Engine**: amount `0.05`, recipient = **a 0x you control** → Confirm → ArcScan  
5. Agent: `Show my balances` → should match wallet  
6. Optional: `Swap 1 USDC to EURC` (needs kit key on server)  
7. Optional: `Bridge 5 USDC from Arc to Base` (needs USDC on Arc + kit)  
8. **Studio** → Send template → **Run on Arc** (self-transfer 0.05)  

**Do not** use name-only recipients (“Sarah”) — product requires full `0x` addresses so testnet funds are never burned to placeholders.

## Product thesis (for Arc)

Users should think in **intents** (“bridge 5 USDC Arc → Base”), not in six dapps.  
Arc’s infrastructure (USDC gas, CCTP, App Kit, agentic economy) makes that possible; AGFusion is the **AI OS UX** on top, with **confirm-before-execute**.

## Security

- No private keys in the client  
- Confirm modal before every money move  
- Live path only after wallet approval  
- Synthetic/demo recipient addresses rejected  
- RPC and Circle Stablecoin Kits APIs proxied server-side  

## Contact

- Site: https://agfusion.vercel.app  
- X: https://x.com/AGfusion_  
- Architecture: `docs/ARCHITECTURE.md`
