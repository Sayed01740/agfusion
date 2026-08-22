"use client";

/**
 * Browser bridge facade used by client-actions.
 *
 * The previous implementation delegated to the generic App Kit bridge path,
 * which used a destination wallet adapter. That makes the browser ask for a
 * second/third signature on the destination mint. It is especially fragile on
 * Arc because USDC is the native gas token there.
 *
 * Circle's Forwarding Service is the correct UX for this flow: the user signs
 * the source-side approval/burn, while Circle fetches the attestation and
 * submits the destination mint. The destination is confirmed through Circle
 * Iris, so no destination wallet signature is required.
 */

import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getAppKit, getAppKitLoadError } from "@/sdk/appkit-client";
import {
  createAppKitAdapterFromBrowser,
  getChainId,
  getInjectedProvider,
  switchToChainId,
  EVM_CHAIN_PARAMS,
} from "@/sdk/wallet-adapter";
import { getCctpConfig } from "@/lib/cctp-chains";
import { explorerTxUrl } from "@/lib/arc-chain";
import { uid } from "@/lib/utils";

interface BridgeKitStepLike {
  name?: string;
  state?: string;
  txHash?: string;
  errorMessage?: string;
  error?: unknown;
  forwarded?: boolean;
  data?: unknown;
  explorerUrl?: string;
}

interface BridgeKitResultLike {
  state?: "pending" | "success" | "error";
  steps?: BridgeKitStepLike[];
  amount?: string;
  source?: { address?: string; chain?: string };
  destination?: { address?: string; chain?: string };
}

function normalizeStepState(state: string | undefined): TxStep["state"] {
  if (state === "success") return "success";
  if (state === "error") return "error";
  if (state === "noop") return "noop";
  if (state === "pending") return "pending";
  return "active";
}

function mapSteps(result: BridgeKitResultLike): TxStep[] {
  return (result.steps || []).map((step) => ({
    name: step.name || "Bridge step",
    state: normalizeStepState(step.state),
    txHash: step.txHash,
    message:
      step.forwarded && step.state === "success"
        ? "Destination mint handled by Circle Forwarding Service and confirmed by Iris."
        : step.errorMessage,
  }));
}

function findStep(result: BridgeKitResultLike, key: string): BridgeKitStepLike | undefined {
  return (result.steps || []).find((step) =>
    String(step.name || "").toLowerCase().includes(key),
  );
}

function hasConfirmedForwardedMint(result: BridgeKitResultLike): boolean {
  const mint = findStep(result, "mint");
  return Boolean(
    result.state === "success" &&
      mint &&
      mint.state === "success" &&
      (mint.forwarded === true || mint.data === undefined),
  );
}

async function prepareSourceAdapter(fromChain: ChainId) {
  const provider = await getInjectedProvider();
  await switchToChainId(provider, fromChain);

  const expected = EVM_CHAIN_PARAMS[fromChain]?.chainId;
  if (expected) {
    const actual = await getChainId(provider);
    if (actual !== expected) {
      throw new Error(
        `Wallet is on chain ${actual}, but ${fromChain.replace(/_/g, " ")} requires chain ${expected}. Switch networks and retry.`,
      );
    }
  }

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) {
    throw new Error("Could not connect the selected wallet adapter. Reconnect the wallet and retry.");
  }
  return wired;
}

async function executeForwardedBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  txId?: string;
  previousResult?: BridgeKitResultLike;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Bridge must run in the browser with your connected wallet.");
  }

  if (params.fromChain === params.toChain) {
    throw new Error("Source and destination must be different chains.");
  }

  const destinationConfig = getCctpConfig(params.toChain);
  if (!destinationConfig) {
    throw new Error(`CCTP configuration is missing for ${params.toChain.replace(/_/g, " ")}.`);
  }

  const kit = await getAppKit();
  if (!kit) {
    const detail = getAppKitLoadError();
    throw new Error(detail ? `App Kit failed to load: ${detail}` : "App Kit is not loaded. Hard-refresh and retry.");
  }

  const wired = await prepareSourceAdapter(params.fromChain);
  const recipient = params.recipient || wired.address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    throw new Error("Bridge recipient must be a valid EVM address.");
  }

  let result: BridgeKitResultLike;
  if (params.previousResult) {
    const retryBridge = (kit as any).retryBridge;
    if (typeof retryBridge !== "function") {
      throw new Error("This Circle App Kit version does not expose retryBridge(). Refresh the page and retry the bridge.");
    }
    result = (await retryBridge(params.previousResult, {
      from: wired.adapter,
    })) as BridgeKitResultLike;
  } else {
    result = (await (kit as any).bridge({
      from: { adapter: wired.adapter, chain: params.fromChain },
      to: {
        recipientAddress: recipient,
        chain: params.toChain,
        useForwarder: true,
      },
      amount: String(params.amount),
      token: "USDC",
    })) as BridgeKitResultLike;
  }

  const steps = mapSteps(result);
  const burn = findStep(result, "burn");
  const mint = findStep(result, "mint");

  if (result.state === "error") {
    const failed = steps.find((step) => step.state === "error");
    const error = new Error(
      failed?.message || "Circle bridge failed. Inspect the failed step and retry from the saved bridge state.",
    );
    (error as any).bridgeResult = result;
    throw error;
  }

  if (!hasConfirmedForwardedMint(result)) {
    return {
      id: params.txId || uid("tx"),
      type: "bridge",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient,
      feeUsd: 0,
      steps: steps.length ? steps : [{ name: "Forwarded mint", state: "pending" }],
      txHash: burn?.txHash,
      explorerUrl: burn?.txHash ? explorerTxUrl(burn.txHash) : destinationConfig.explorerUrl,
      createdAt: new Date().toISOString(),
      message: "Source bridge transaction is recorded, but Circle has not confirmed the forwarded destination mint yet. Retry to check status. No new burn will be submitted.",
      executionMode: "live",
      bridgeResult: result,
    };
  }

  return {
    id: params.txId || uid("tx"),
    type: "bridge",
    status: "success",
    retryable: false,
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient,
    feeUsd: 0,
    steps: steps.length
      ? steps
      : [{ name: "Destination Mint", state: "success", message: "Confirmed by Circle Forwarding Service." }],
    txHash: mint?.txHash,
    explorerUrl: mint?.explorerUrl || (mint?.txHash ? explorerTxUrl(mint.txHash) : undefined),
    createdAt: new Date().toISOString(),
    message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Circle Forwarding Service confirmed the destination mint through Iris; no destination wallet signature was required.`,
    executionMode: "live",
    bridgeResult: result,
  };
}

export async function runBridgeKitFlow(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  txId?: string;
  recipient?: string;
  failedResult?: unknown;
}): Promise<TransactionRecord> {
  return executeForwardedBridge(params);
}

export async function runBridgeKitRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  failedTx?: TransactionRecord | null;
  txId?: string;
}): Promise<TransactionRecord> {
  const previousResult = failedTxResult(params.failedTx);
  return executeForwardedBridge({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient: params.recipient,
    txId: params.txId,
    previousResult,
  });
}

function failedTxResult(tx: TransactionRecord | null | undefined): BridgeKitResultLike | undefined {
  if (!tx?.bridgeResult || typeof tx.bridgeResult !== "object") return undefined;
  const candidate = tx.bridgeResult as BridgeKitResultLike;
  return Array.isArray(candidate.steps) ? candidate : undefined;
}
