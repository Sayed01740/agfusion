/**
 * Client-safe action runners with API-first + local fallback.
 */

import { orchestrateUserMessage } from "@/ai/orchestrator";
import { runBridgeFlow, runBridgeWithRecovery, runSendFlow, runUnifiedDeposit, runUnifiedSpend } from "@/blockchain/appkit-service";
import { runProductionSwap } from "@/blockchain/production-swap";
import { runCircleEmailWalletForwardingBridge } from "@/lib/circle-forwarding-bridge";
import { finalizeVerifiedTransaction } from "@/lib/financial-receipt";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import type { ActionPreview, ChainId, ChatMessage, TransactionRecord } from "@/types";

function withTimeout(ms: number): AbortSignal | undefined { try { if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms); } catch {} return undefined; }

async function assertAgentPolicy(amount: string, action: "bridge" | "swap" | "send" | "route", recipient?: string): Promise<void> {
  const meta = getActiveWalletMeta();
  if (!meta?.smartAccountAddress) return;
  const res = await fetch("/api/agent/policy/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, action, recipient, smartAccountAddress: meta.smartAccountAddress }), signal: withTimeout(10_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.allowed !== true) throw new Error(data?.reason || "Agent spending policy blocked this transaction.");
}

export async function chatWithAI(message: string, execute = false, wallet?: { address?: string | null; chainId?: number | null; liveBalanceUsdc?: string | null; forceDemo?: boolean }): Promise<{ message: ChatMessage; transaction?: TransactionRecord }> {
  const meta = getActiveWalletMeta();
  const requestWallet = { ...(wallet || {}), smartAccountAddress: meta?.smartAccountAddress || null };
  try { const res = await fetch("/api/ai/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, execute, confirmed: execute, wallet: requestWallet, stream: false }), signal: withTimeout(120_000) }); if (res.ok) { const data = await res.json(); if (data?.message) return data; } } catch {}
  try { const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, execute }), signal: withTimeout(120_000) }); if (res.ok) { const data = await res.json(); if (data?.message) return data; } } catch {}
  return orchestrateUserMessage(message, { execute });
}

export async function executeBridge(params: { amount: string; fromChain: ChainId; toChain: ChainId; token?: string; preferLive?: boolean; txId?: string; recipient?: string }): Promise<TransactionRecord> {
  await assertAgentPolicy(params.amount, "bridge", params.recipient);
  if (getActiveWalletMeta()?.uuid === "circle-pw") return runCircleEmailWalletForwardingBridge({ amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, txId: params.txId, recipient: params.recipient });
  const result = await runBridgeFlow({ amount: params.amount, token: params.token || "USDC", fromChain: params.fromChain, toChain: params.toChain, preferLive: params.preferLive ?? true, txId: params.txId, recipient: params.recipient });
  return finalizeVerifiedTransaction(result, params.toChain);
}

export async function executeSwap(params: { amount: string; tokenIn?: string; tokenOut?: string; chain?: ChainId; slippageBps?: number }): Promise<TransactionRecord> { const chain = params.chain || "Arc_Testnet"; await assertAgentPolicy(params.amount, "swap"); const result = await runProductionSwap({ amount: params.amount, tokenIn: params.tokenIn || "USDC", tokenOut: params.tokenOut || "EURC", chain, slippageBps: params.slippageBps }); return finalizeVerifiedTransaction(result, chain); }
export async function executeSend(params: { amount: string; token?: string; chain?: ChainId; recipient: string; recipientLabel?: string; preferLive?: boolean }): Promise<TransactionRecord> { const chain = params.chain || "Arc_Testnet"; await assertAgentPolicy(params.amount, "send", params.recipient); const result = await runSendFlow({ amount: params.amount, token: params.token || "USDC", chain, recipient: params.recipient, recipientLabel: params.recipientLabel, preferLive: params.preferLive ?? true }); return finalizeVerifiedTransaction(result, chain); }
export async function executeUnifiedDeposit(params: { amount: string; fromChain: ChainId }): Promise<TransactionRecord> { const result = await runUnifiedDeposit(params); return finalizeVerifiedTransaction(result, result.fromChain || params.fromChain); }
export async function executeUnifiedSpend(params: { amount: string; recipient: string; recipientLabel?: string }): Promise<TransactionRecord> { await assertAgentPolicy(params.amount, "route", params.recipient); const result = await runUnifiedSpend(params); return finalizeVerifiedTransaction(result, result.fromChain || "Arc_Testnet"); }
export async function executeBridgeRecovery(params: { amount: string; fromChain: ChainId; toChain: ChainId; token?: string; recipient?: string; failedTx?: TransactionRecord | null; txId?: string }): Promise<TransactionRecord> { await assertAgentPolicy(params.amount, "bridge", params.recipient); if (getActiveWalletMeta()?.uuid === "circle-pw") return runCircleEmailWalletForwardingBridge({ amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient, txId: params.txId }); const result = await runBridgeWithRecovery({ amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, token: params.token, recipient: params.recipient, failedTx: params.failedTx, txId: params.txId }); return finalizeVerifiedTransaction(result, params.toChain); }

export function commandFromPreview(preview: ActionPreview): string { const amount = preview.amount || "50", token = preview.token || "USDC"; switch (preview.type) { case "route": return preview.recipient ? `Move $${amount} to Arc and pay ${preview.recipient}` : `Move $${amount} to Arc — need 0x recipient`; case "bridge": return `Bridge $${amount} from ${preview.fromChain || "Arc_Testnet"} to ${preview.toChain || "Base_Sepolia"}`; case "swap": return `Swap ${amount} ${token} to ${preview.tokenOut || "EURC"}`; case "send": return preview.recipient ? `Send $${amount} ${token} to ${preview.recipient}` : `Send $${amount} ${token} — paste 0x address`; default: return `Show my balances`; } }
