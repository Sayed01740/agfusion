/**
 * Client-safe action runners with API-first + local fallback.
 */

import { orchestrateUserMessage } from "@/ai/orchestrator";
import {
  runBridgeFlow,
  runBridgeWithRecovery,
  runSendFlow,
  runSwapFlow,
  runUnifiedDeposit,
  runUnifiedSpend,
} from "@/blockchain/appkit-service";
import { runCircleEmailWalletForwardingBridge } from "@/lib/circle-forwarding-bridge";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import type {
  ActionPreview,
  ChainId,
  ChatMessage,
  TransactionRecord,
} from "@/types";

function withTimeout(ms: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      return AbortSignal.timeout(ms);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function chatWithAI(
  message: string,
  execute = false,
  wallet?: {
    address?: string | null;
    chainId?: number | null;
    liveBalanceUsdc?: string | null;
    forceDemo?: boolean;
  },
): Promise<{ message: ChatMessage; transaction?: TransactionRecord }> {
  // Prefer non-stream agent JSON, then legacy orchestrator
  try {
    const res = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        execute,
        confirmed: execute,
        wallet: wallet || {},
        stream: false,
      }),
      signal: withTimeout(120_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.message) return data;
    }
  } catch {
    /* try legacy */
  }

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, execute }),
      signal: withTimeout(120_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.message) return data;
    }
  } catch {
    /* local */
  }
  return orchestrateUserMessage(message, { execute });
}

export async function executeBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  token?: string;
  preferLive?: boolean;
  /** Original tx id so the returned record keeps the placeholder id */
  txId?: string;
  /** Mint recipient (defaults to the connected wallet address) */
  recipient?: string;
}): Promise<TransactionRecord> {
  // Circle Email Wallets use the CCTP Forwarding Service directly. This avoids
  // App Kit's destination-chain EIP-1193 lifecycle, which is not compatible
  // with Circle's hosted user-controlled wallet provider.
  if (getActiveWalletMeta()?.uuid === "circle-pw") {
    return runCircleEmailWalletForwardingBridge({
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      txId: params.txId,
      recipient: params.recipient,
    });
  }

  // Normal browser wallets stay on the existing App Kit live path.
  return runBridgeFlow({
    amount: params.amount,
    token: params.token || "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    preferLive: params.preferLive ?? true,
    txId: params.txId,
    recipient: params.recipient,
  });
}

export async function executeSwap(params: {
  amount: string;
  tokenIn?: string;
  tokenOut?: string;
  chain?: ChainId;
}): Promise<TransactionRecord> {
  // Always browser-local — App Kit swap needs wallet + kit key (not serverless)
  return runSwapFlow({
    amount: params.amount,
    tokenIn: params.tokenIn || "USDC",
    tokenOut: params.tokenOut || "EURC",
    chain: params.chain || "Arc_Testnet",
  });
}

export async function executeSend(params: {
  amount: string;
  token?: string;
  chain?: ChainId;
  recipient: string;
  recipientLabel?: string;
  preferLive?: boolean;
}): Promise<TransactionRecord> {
  // Always browser-local — wallet signature required
  return runSendFlow({
    amount: params.amount,
    token: params.token || "USDC",
    chain: params.chain || "Arc_Testnet",
    recipient: params.recipient,
    recipientLabel: params.recipientLabel,
    preferLive: params.preferLive ?? true,
  });
}

export async function executeUnifiedDeposit(params: {
  amount: string;
  fromChain: ChainId;
}): Promise<TransactionRecord> {
  return runUnifiedDeposit(params);
}

export async function executeUnifiedSpend(params: {
  amount: string;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord> {
  return runUnifiedSpend(params);
}

export async function executeBridgeRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  token?: string;
  recipient?: string;
  /** The failed bridge transaction being recovered (must match params) */
  failedTx?: TransactionRecord | null;
  /** Original tx id so the recovered record replaces the failed one */
  txId?: string;
}): Promise<TransactionRecord> {
  // Recovery must stay on the same bridge implementation that created the
  // transaction. Circle Email Wallet bridges persist their source burn and
  // destination-forwarding state in circle-forwarding-bridge.ts; sending a
  // Circle recovery through App Kit would try to use the incompatible
  // destination-chain EIP-1193 lifecycle and can duplicate the wrong path.
  if (getActiveWalletMeta()?.uuid === "circle-pw") {
    return runCircleEmailWalletForwardingBridge({
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient: params.recipient,
      txId: params.txId,
    });
  }

  return runBridgeWithRecovery({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    token: params.token,
    recipient: params.recipient,
    failedTx: params.failedTx,
    txId: params.txId,
  });
}

export function commandFromPreview(preview: ActionPreview): string {
  const amount = preview.amount || "50";
  const token = preview.token || "USDC";
  const label = preview.recipientLabel;

  switch (preview.type) {
    case "route":
      return preview.recipient
        ? `Move $${amount} to Arc and pay ${preview.recipient}`
        : `Move $${amount} to Arc — need 0x recipient`;
    case "bridge":
      return `Bridge $${amount} from ${preview.fromChain || "Arc_Testnet"} to ${preview.toChain || "Base_Sepolia"}`;
    case "swap":
      return `Swap ${amount} ${token} to ${preview.tokenOut || "EURC"}`;
    case "send":
      return preview.recipient
        ? `Send $${amount} ${token} to ${preview.recipient}`
        : `Send $${amount} ${token} — paste 0x address`;
    default:
      return `Show my balances`;
  }
}
