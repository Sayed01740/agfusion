"use client";

import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import {
  getInjectedProvider,
  requestAccounts,
  switchToChainId,
} from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import {
  initBridgeState,
  loadBridgeState,
  saveBridgeState,
  updateBridgeState,
  type BridgeState,
  type BridgeStateName,
} from "@/lib/bridge-state";
import { CHAINS } from "@/lib/chains";

export interface BridgeKitStepLike {
  name?: string;
  state?: string;
  txHash?: string;
  errorMessage?: string;
  error?: unknown;
}

export interface BridgeKitResultLike {
  state?: string;
  steps?: BridgeKitStepLike[];
  amount?: string;
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    for (const key of ["message", "errorMessage", "reason", "details"]) {
      if (typeof v[key] === "string" && v[key]) return v[key] as string;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isRetryableMessage(message: string): boolean {
  return /(network|timeout|timed out|rpc|fetch|502|503|504|temporar|attestation|rate.?limit|429|gateway|connection|socket|transport)/i.test(
    message,
  );
}

function destinationHash(steps: BridgeKitStepLike[]): string | undefined {
  return [...steps]
    .reverse()
    .find((step) => {
      const name = (step.name || "").toLowerCase();
      return step.state === "success" && !!step.txHash && /(mint|receive|destination)/i.test(name);
    })?.txHash;
}

function latestTxHash(steps: BridgeKitStepLike[]): string | undefined {
  return [...steps].reverse().find((step) => !!step.txHash)?.txHash;
}

function mapSteps(steps: BridgeKitStepLike[] = []): TxStep[] {
  return steps.map((step) => ({
    name: step.name || "Bridge step",
    state:
      step.state === "success"
        ? "success"
        : step.state === "error"
          ? "error"
          : step.state === "pending"
            ? "pending"
            : "active",
    txHash: step.txHash,
    message: step.errorMessage || (step.error ? errorText(step.error) : undefined),
  }));
}

function deriveState(steps: BridgeKitStepLike[], failedMessage?: string): BridgeStateName {
  if (failedMessage) {
    const burned = steps.some((s) => s.state === "success" && /(burn|deposit)/i.test(s.name || ""));
    return burned ? "RECOVERABLE" : "FAILED";
  }

  const has = (pattern: RegExp, state = "success") =>
    steps.some((s) => s.state === state && pattern.test(s.name || ""));

  if (has(/mint|receive|destination/i)) return "COMPLETED";
  if (has(/attestation|message/i)) return "ATTESTATION_RECEIVED";
  if (has(/burn|deposit/i)) return "BURN_CONFIRMED";
  if (has(/approv/i)) return "APPROVED";

  const active = steps.find((s) => s.state === "pending" || s.state === "active");
  const name = (active?.name || "").toLowerCase();
  if (/mint|receive|destination/.test(name)) return "DESTINATION_PENDING";
  if (/attestation|message/.test(name)) return "ATTESTATION_PENDING";
  if (/burn|deposit/.test(name)) return "BURN_PENDING";
  if (/approv/.test(name)) return "APPROVAL_PENDING";
  return "INIT";
}

function buildBridgeState(params: {
  txId: string;
  walletAddress: string | null;
  fromChain: ChainId;
  toChain: ChainId;
  amount: string;
  recipient?: string;
  result?: BridgeKitResultLike;
  error?: string;
}): BridgeState {
  const steps = params.result?.steps || [];
  const destination = destinationHash(steps);
  const approval = [...steps].reverse().find((s) => /approv/i.test(s.name || "") && s.txHash)?.txHash;
  const burn = [...steps].reverse().find((s) => /burn|deposit/i.test(s.name || "") && s.txHash)?.txHash;
  const state = deriveState(steps, params.error);
  return {
    txId: params.txId,
    walletType: "evm",
    walletAddress: params.walletAddress,
    fromChain: params.fromChain,
    toChain: params.toChain,
    token: "USDC",
    amount: params.amount,
    recipient: params.recipient,
    approvalTxHash: approval,
    burnTxHash: burn,
    destinationTxHash: destination,
    state,
    error: params.error,
    createdAt: loadBridgeState(params.txId)?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function resultMessage(result: BridgeKitResultLike, fromChain: ChainId, toChain: ChainId): string {
  if (result.state === "success") {
    return `Bridge confirmed: ${fromChain.replace(/_/g, " ")} → ${toChain.replace(/_/g, " ")}.`;
  }
  const failed = (result.steps || []).find((s) => s.state === "error");
  return failed
    ? failed.errorMessage || errorText(failed.error) || "Bridge step failed."
    : "Bridge did not complete. Review the step status and retry.";
}

async function makeAdapter() {
  if (typeof window === "undefined") throw new Error("Bridge execution must run in the browser.");
  const provider = await getInjectedProvider();
  await requestAccounts(provider);

  // wallet-adapter intentionally exposes a looser EIP-1193 provider type because
  // some injected wallets omit optional event methods. Bridge Kit's viem adapter
  // type requires those methods at compile time, while the runtime only needs the
  // standard request interface for transaction execution. Keep the boundary cast
  // here rather than weakening the shared wallet provider type across the app.
  const bridgeProvider = provider as unknown as Parameters<typeof createViemAdapterFromProvider>[0]["provider"];

  return {
    provider,
    adapter: await createViemAdapterFromProvider({ provider: bridgeProvider }),
  };
}

async function executeKitBridge(params: {
  adapter: Awaited<ReturnType<typeof makeAdapter>>["adapter"];
  fromChain: ChainId;
  toChain: ChainId;
  amount: string;
  recipient?: string;
  failedResult?: BridgeKitResultLike;
}): Promise<BridgeKitResultLike> {
  const kit = new BridgeKit();
  if (params.failedResult) {
    return (await kit.retry(params.failedResult as never, {
      from: params.adapter,
      to: params.adapter,
    } as never)) as BridgeKitResultLike;
  }

  return (await kit.bridge({
    from: { adapter: params.adapter, chain: params.fromChain },
    to: {
      adapter: params.adapter,
      chain: params.toChain,
      ...(params.recipient ? { recipientAddress: params.recipient } : {}),
    },
    amount: params.amount,
    token: "USDC",
  })) as BridgeKitResultLike;
}

export async function runBridgeKitFlow(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  txId?: string;
  recipient?: string;
  failedResult?: unknown;
}): Promise<TransactionRecord> {
  if (params.fromChain === params.toChain) throw new Error("Pick different source and destination chains.");
  if (!Number.isFinite(Number(params.amount)) || Number(params.amount) <= 0) {
    throw new Error("Enter a valid USDC amount.");
  }
  if (getActiveWalletMeta()?.uuid === "circle-pw") {
    throw new Error("Circle Email Wallet uses its dedicated bridge flow. Reconnect with an EVM browser wallet for this route.");
  }

  const txId = params.txId || `tx_${Date.now()}`;
  const wallet = await makeAdapter();
  const accounts = (await wallet.provider.request({ method: "eth_accounts" })) as string[];
  const walletAddress = accounts?.[0] || getActiveWalletMeta()?.address || null;

  await switchToChainId(wallet.provider, params.fromChain);

  const initial = loadBridgeState(txId);
  if (!initial) {
    initBridgeState({
      txId,
      walletType: "evm",
      walletAddress,
      fromChain: params.fromChain,
      toChain: params.toChain,
      token: "USDC",
      amount: params.amount,
      recipient: params.recipient,
    });
  }

  let result: BridgeKitResultLike | undefined;
  let failure: string | undefined;

  try {
    result = await executeKitBridge({
      adapter: wallet.adapter,
      fromChain: params.fromChain,
      toChain: params.toChain,
      amount: params.amount,
      recipient: params.recipient,
      failedResult: params.failedResult as BridgeKitResultLike | undefined,
    });
  } catch (error) {
    failure = errorText(error);
  }

  const state = buildBridgeState({
    txId,
    walletAddress,
    fromChain: params.fromChain,
    toChain: params.toChain,
    amount: params.amount,
    recipient: params.recipient,
    result,
    error: failure,
  });
  saveBridgeState(state);

  const steps = mapSteps(result?.steps);
  const txHash = destinationHash(result?.steps || []) || latestTxHash(result?.steps || []);
  const retryable = !!failure && isRetryableMessage(failure);
  const status: TransactionRecord["status"] = result?.state === "success" && destinationHash(result.steps || [])
    ? "success"
    : failure
      ? retryable ? "retryable" : "error"
      : "retryable";

  if (failure) updateBridgeState(txId, { state: state.state, error: failure });

  return {
    id: txId,
    type: "bridge",
    status,
    retryable: status === "retryable",
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    feeUsd: 0.05,
    steps,
    txHash,
    createdAt: new Date().toISOString(),
    message: failure || (result ? resultMessage(result, params.fromChain, params.toChain) : "Bridge did not complete."),
    executionMode: "live",
    bridgeState: state,
  } as TransactionRecord;
}
