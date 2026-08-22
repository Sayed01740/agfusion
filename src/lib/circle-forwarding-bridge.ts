/**
 * Circle Email Wallet bridge path.
 *
 * Browser-wallet/Circle Email Wallet mode intentionally uses the user's
 * connected EVM wallet for BOTH sides of the CCTP bridge. This is the
 * user-controlled flow: source approve -> source burn -> attestation ->
 * destination mint. The wallet therefore switches from Arc to Base and
 * receives the destination mint signature instead of silently handing the
 * mint to Circle's Forwarding Service.
 */

import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, switchToChainId, getChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import {
  deriveBridgeState,
  initBridgeState,
  loadBridgeState,
  saveBridgeState,
  type BridgeState,
} from "@/lib/bridge-state";

type SdkStep = {
  name?: string;
  state?: string;
  txHash?: string;
  errorMessage?: string;
  error?: unknown;
};

type SdkBridgeResult = {
  state?: "pending" | "success" | "error";
  steps?: SdkStep[];
  amount?: string;
  source?: unknown;
  destination?: unknown;
  provider?: string;
};

function stepName(step: SdkStep): string {
  return String(step.name || "step").toLowerCase();
}

function findStep(steps: SdkStep[] | undefined, names: string[]): SdkStep | undefined {
  return [...(steps || [])]
    .reverse()
    .find((step) => names.some((name) => stepName(step).includes(name)));
}

function findHash(steps: SdkStep[] | undefined, names: string[]): string | undefined {
  return findStep(steps, names)?.txHash;
}

function toTxSteps(steps: SdkStep[] | undefined): TxStep[] {
  return (steps || []).map((step) => ({
    name: step.name || "Bridge step",
    state:
      step.state === "success"
        ? "success"
        : step.state === "error"
          ? "error"
          : step.state === "pending"
            ? "pending"
            : "success",
    txHash: step.txHash,
    message: step.errorMessage,
  }));
}

function assertRoute(fromChain: ChainId, toChain: ChainId): void {
  if (
    !CIRCLE_BRIDGE_CHAINS.includes(fromChain) ||
    !CIRCLE_BRIDGE_CHAINS.includes(toChain)
  ) {
    throw new Error("Circle Email Wallet currently supports Arc Testnet ↔ Base Sepolia bridging.");
  }
  if (fromChain === toChain) throw new Error("Source and destination must be different chains.");
}

function assertAddress(address: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Bridge recipient must be a valid EVM address.");
  }
}

function isCompleted(result: SdkBridgeResult): boolean {
  if (result.state !== "success") return false;
  const mint = findStep(result.steps, ["mint", "receive", "destination"]);
  return mint?.state === "success" && !!mint.txHash;
}

function buildRecord(
  result: SdkBridgeResult,
  state: BridgeState,
  params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string },
): TransactionRecord {
  const steps = toTxSteps(result.steps);
  const mintHash = findHash(result.steps, ["mint", "receive", "destination"]);
  const burnHash = findHash(result.steps, ["burn"]);
  const completed = isCompleted(result);

  return {
    id: state.txId,
    type: "bridge",
    status: completed ? "success" : result.state === "error" ? "error" : "retryable",
    retryable: !completed && result.state !== "error",
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient: params.recipient,
    feeUsd: 0,
    steps:
      steps.length > 0
        ? steps
        : [{ name: "CCTP bridge", state: completed ? "success" : "pending" }],
    // The destination mint is the final transaction and is the correct
    // explorer/activity reference once the bridge is settled.
    txHash: mintHash || burnHash,
    explorerUrl: mintHash
      ? params.toChain === "Base_Sepolia"
        ? `https://sepolia.basescan.org/tx/${mintHash}`
        : `https://testnet.arcscan.app/tx/${mintHash}`
      : burnHash
        ? params.fromChain === "Arc_Testnet"
          ? `https://testnet.arcscan.app/tx/${burnHash}`
          : `https://sepolia.basescan.org/tx/${burnHash}`
        : undefined,
    createdAt: new Date(state.createdAt).toISOString(),
    message: completed
      ? `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Destination mint confirmed.`
      : result.state === "error"
        ? findStep(result.steps, ["error"])?.errorMessage || "Bridge failed."
        : "Bridge is waiting for destination mint confirmation.",
    executionMode: "live",
    bridgeResult: result,
    bridgeState: state,
  };
}

export async function runCircleEmailWalletForwardingBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  txId?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Circle Email Wallet bridge must run in the browser.");
  }

  assertRoute(params.fromChain, params.toChain);

  const meta = getActiveWalletMeta();
  if (meta?.uuid !== "circle-pw") {
    throw new Error("Circle Email Wallet bridge path requires the active Circle Email Wallet.");
  }

  const walletAddress = meta.address || "";
  assertAddress(walletAddress);
  const recipient = params.recipient || walletAddress;
  assertAddress(recipient);

  const kit = await getAppKit();
  if (!kit) throw new Error("Circle App Kit failed to load. Hard-refresh and reconnect the wallet.");

  // One adapter object is intentionally reused for source AND destination.
  // App Kit/Viem handles the chain switch before the destination mint.
  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired?.adapter) {
    throw new Error("Could not create the Circle Email Wallet bridge adapter. Reconnect the wallet and retry.");
  }

  const provider = wired.provider || wired.adapter;
  try {
    await switchToChainId(provider as any, params.fromChain);
    const expected = EVM_CHAIN_PARAMS[params.fromChain]?.chainId;
    if (expected) {
      const actual = await getChainId(provider as any);
      if (actual !== expected) {
        throw new Error(`Wallet is on chain ${actual}, expected ${expected} for ${params.fromChain}.`);
      }
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const txId = params.txId || uid("tx");
  let state = params.txId ? loadBridgeState(params.txId) : null;
  if (!state) {
    state = initBridgeState({
      txId,
      walletType: "circle",
      walletAddress,
      fromChain: params.fromChain,
      toChain: params.toChain,
      token: "USDC",
      amount: params.amount,
      recipient,
    });
  }

  let result: SdkBridgeResult;
  try {
    // IMPORTANT: do NOT set useForwarder=true here. The requested UX is the
    // normal user-controlled CCTP lifecycle, which produces the destination
    // mint transaction on Base and therefore the third wallet signature.
    result = (await kit.bridge({
      from: {
        adapter: wired.adapter,
        chain: params.fromChain,
      },
      to: {
        adapter: wired.adapter,
        chain: params.toChain,
        recipientAddress: recipient,
      },
      amount: params.amount,
      token: "USDC",
    })) as SdkBridgeResult;
  } catch (error) {
    const partial = (error as any)?.bridgeResult as SdkBridgeResult | undefined;
    if (partial) {
      const burnHash = findHash(partial.steps, ["burn"]);
      state = {
        ...state,
        burnTxHash: burnHash || state.burnTxHash,
        attestationData: partial,
        state: burnHash ? "RECOVERABLE" : "FAILED",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      };
      saveBridgeState(state);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  const burnHash = findHash(result.steps, ["burn"]);
  const mintHash = findHash(result.steps, ["mint", "receive", "destination"]);
  const completed = isCompleted(result);

  state = {
    ...state,
    burnTxHash: burnHash || state.burnTxHash,
    attestationData: result,
    state: completed ? "COMPLETED" : burnHash ? "RECOVERABLE" : "FAILED",
    error: completed ? undefined : "Destination mint has not been confirmed yet.",
    updatedAt: Date.now(),
  };
  saveBridgeState(state);

  const record = buildRecord(result, state, {
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient,
  });

  if (!completed && result.state === "error") {
    const failed = result.steps?.find((step) => step.state === "error");
    throw new Error(failed?.errorMessage || "Circle CCTP bridge failed. Existing burn will not be repeated automatically.");
  }

  // If App Kit returns before mint confirmation, keep the record retryable.
  // This is intentional: no false success and no second burn.
  return record;
}
