import type { ChainId, TransactionRecord } from "@/types";
import { getAppKit, getAppKitLoadError } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser } from "@/sdk/wallet-adapter";
import { explorerTxUrl } from "@/lib/arc-chain";
import { rpcKeyForChain } from "./appkit-service";
import { runBridgeFlow, runSendFlow } from "./appkit-service";

export * from "./appkit-service";

function assertPositiveAmount(amount: string, context: string): void {
  const n = Number(amount);
  if (!amount || Number.isNaN(n) || n <= 0) {
    throw new Error(`Enter a valid ${context} amount (USDC).`);
  }
}

async function verifySubmittedReceipt(
  chain: ChainId,
  txHash: string | undefined,
  operation: string,
): Promise<"success" | "error" | "retryable"> {
  if (!txHash) return "retryable";
  try {
    const { verifyReceiptOnChain } = await import("@/lib/tx-verify");
    const result = await verifyReceiptOnChain({
      chainKey: rpcKeyForChain(chain),
      txHash,
      attempts: 4,
      delayMs: 1_500,
    });
    if (result.status === "success") return "success";
    if (result.status === "reverted") return "error";
    return "retryable";
  } catch (error) {
    console.warn(`[AGFusion] ${operation} receipt verification unavailable`, error);
    return "retryable";
  }
}

function statusMessage(
  operation: string,
  chain: ChainId,
  status: "success" | "error" | "retryable",
): string {
  if (status === "success") return `${operation} confirmed on ${chain}.`;
  if (status === "error") return `${operation} reverted on ${chain}.`;
  return `${operation} was submitted, but confirmation could not be established. Check the explorer before retrying.`;
}

export async function runUnifiedDeposit(params: {
  amount: string;
  fromChain: ChainId;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") throw new Error("Unified Balance deposit must run in the browser.");
  assertPositiveAmount(params.amount, "deposit");

  const kit = await getAppKit();
  if (!kit?.unifiedBalance) {
    const detail = getAppKitLoadError();
    throw new Error(detail ? `Unified Balance unavailable: ${detail}` : "Unified Balance is unavailable. Hard-refresh and retry.");
  }

  const { getInjectedProvider, requestAccounts, switchToChainId } = await import("@/sdk/wallet-adapter");
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  await switchToChainId(provider, params.fromChain);

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) throw new Error("Wallet not ready. Reconnect your wallet and retry.");

  const result = (await kit.unifiedBalance.deposit({
    from: { adapter: wired.adapter, chain: params.fromChain },
    amount: String(params.amount),
    token: "USDC",
    allowanceStrategy: "approve",
  })) as { txHash?: string; explorerUrl?: string };

  const status = await verifySubmittedReceipt(params.fromChain, result?.txHash, "Unified Balance deposit");

  return {
    id: `tx_unified_deposit_${Date.now()}`,
    type: "bridge",
    status,
    retryable: status === "retryable",
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: "Arc_Testnet",
    feeUsd: 0.05,
    steps: [{
      name: "Unified Balance deposit",
      state: status === "error" ? "error" : status === "success" ? "success" : "pending",
      txHash: result?.txHash,
    }],
    txHash: result?.txHash,
    explorerUrl: result?.explorerUrl || (result?.txHash ? explorerTxUrl(result.txHash) : undefined),
    createdAt: new Date().toISOString(),
    message: statusMessage("Unified Balance deposit", params.fromChain, status),
    executionMode: "live",
  };
}

export async function runUnifiedSpend(params: {
  amount: string;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") throw new Error("Unified Balance spend must run in the browser.");
  assertPositiveAmount(params.amount, "spend");

  const { requireSafeRecipient } = await import("@/lib/balances-empty");
  const recipient = requireSafeRecipient(params.recipient, params.recipientLabel);

  const kit = await getAppKit();
  if (!kit?.unifiedBalance) throw new Error("Unified Balance is unavailable. Connect a supported wallet and retry.");

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) throw new Error("Wallet not ready. Reconnect your wallet and retry.");

  const result = (await kit.unifiedBalance.spend({
    amount: String(params.amount),
    token: "USDC",
    from: { adapter: wired.adapter, address: wired.address },
    to: { adapter: wired.adapter, chain: "Arc_Testnet", address: recipient },
  })) as { txHash?: string; explorerUrl?: string };

  const status = await verifySubmittedReceipt("Arc_Testnet", result?.txHash, "Unified Balance spend");

  return {
    id: `tx_unified_spend_${Date.now()}`,
    type: "unified_spend",
    status,
    retryable: status === "retryable",
    amount: params.amount,
    token: "USDC",
    toChain: "Arc_Testnet",
    recipient,
    recipientLabel: params.recipientLabel,
    feeUsd: 0.08,
    steps: [{
      name: "Unified Balance spend → Arc",
      state: status === "error" ? "error" : status === "success" ? "success" : "pending",
      txHash: result?.txHash,
    }],
    txHash: result?.txHash,
    explorerUrl: result?.explorerUrl || (result?.txHash ? explorerTxUrl(result.txHash) : undefined),
    createdAt: new Date().toISOString(),
    message: statusMessage("Unified Balance spend", "Arc_Testnet", status),
    executionMode: "live",
  };
}

export async function runUnifiedRouteFlow(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord> {
  const bridged = await runBridgeFlow({
    amount: params.amount,
    token: params.token,
    fromChain: params.fromChain,
    toChain: "Arc_Testnet",
    preferLive: true,
  });

  // A failed or pending bridge never becomes a direct Arc payment.
  if (bridged.status !== "success") return bridged;

  return runSendFlow({
    amount: params.amount,
    token: params.token,
    chain: "Arc_Testnet",
    recipient: params.recipient,
    recipientLabel: params.recipientLabel,
    preferLive: true,
  });
}
