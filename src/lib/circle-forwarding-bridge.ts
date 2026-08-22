/**
 * Circle Email Wallet bridge path.
 *
 * IMPORTANT: do not hand-roll CCTP forwarding here. App Kit already supports
 * the Circle Forwarding Service and knows how to wait for Iris confirmation.
 * For a user-controlled Circle wallet we sign only the source-chain work.
 * The destination adapter is intentionally omitted and useForwarder=true is
 * used, so the destination mint is submitted by Circle's relayer.
 */

import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, switchToChainId } from "@/sdk/wallet-adapter";
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
  forwarded?: boolean;
  data?: unknown;
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

function findBurnHash(steps: SdkStep[] | undefined): string | undefined {
  return findStep(steps, ["burn"])?.txHash;
}

function toTxSteps(steps: SdkStep[] | undefined): TxStep[] {
  return (steps || []).map((step) => ({
    name:
      step.forwarded && stepName(step).includes("mint")
        ? "Destination Mint (Circle Forwarder)"
        : step.name || "Bridge step",
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

function isForwardedSuccess(result: SdkBridgeResult): boolean {
  if (result.state !== "success") return false;
  const mint = findStep(result.steps, ["mint", "receive", "destination"]);
  // Forwarder mints deliberately do not expose a local txHash. Circle's Iris
  // confirmation is the completion signal in this mode.
  return !!mint && (mint.state === "success" || mint.state === "noop" || mint.forwarded === true);
}

function buildRecord(
  result: SdkBridgeResult,
  state: BridgeState,
  params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string },
): TransactionRecord {
  const steps = toTxSteps(result.steps);
  const burnHash = findBurnHash(result.steps);
  const forwardedMint = findStep(result.steps, ["mint", "receive", "destination"]);
  const forwarderConfirmed = isForwardedSuccess(result);

  return {
    id: state.txId,
    type: "bridge",
    status: forwarderConfirmed ? "success" : result.state === "error" ? "error" : "retryable",
    retryable: !forwarderConfirmed && result.state !== "error",
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient: params.recipient,
    feeUsd: 0,
    steps:
      steps.length > 0
        ? steps
        : [{ name: "Circle Forwarding Service", state: forwarderConfirmed ? "success" : "pending" }],
    // Forwarder mode intentionally has no locally signed destination tx hash.
    // Keep the source burn hash as the transaction/explorer reference instead.
    txHash: burnHash,
    explorerUrl: burnHash
      ? params.fromChain === "Arc_Testnet"
        ? `https://testnet.arcscan.app/tx/${burnHash}`
        : `https://sepolia.basescan.org/tx/${burnHash}`
      : undefined,
    createdAt: new Date(state.createdAt).toISOString(),
    message: forwarderConfirmed
      ? `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Circle Forwarding Service confirmed the destination mint.`
      : forwardedMint?.errorMessage || "Bridge is still processing through Circle Forwarding Service.",
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
    throw new Error("Circle Email Wallet forwarding path requires the active Circle Email Wallet.");
  }

  const walletAddress = meta.address || "";
  assertAddress(walletAddress);
  const recipient = params.recipient || walletAddress;
  assertAddress(recipient);

  const kit = await getAppKit();
  if (!kit) throw new Error("Circle App Kit failed to load. Hard-refresh and reconnect the wallet.");

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired?.adapter) {
    throw new Error("Could not create the Circle Email Wallet bridge adapter. Reconnect the wallet and retry.");
  }

  // The source wallet must be on the source chain before App Kit starts.
  // There is deliberately NO destination chain switch and NO destination
  // adapter. useForwarder=true makes Circle own the destination mint.
  const provider = wired.provider || wired.adapter;
  try {
    if (provider) await switchToChainId(provider as any, params.fromChain);
  } catch {
    // The Circle adapter may already be chain-bound. App Kit will validate the
    // source context itself, so don't turn an adapter-specific switch failure
    // into a second signing flow.
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

  // Never start a second burn for a state that already has a confirmed burn.
  // Recovery must use the exact SDK result returned by App Kit.
  let result: SdkBridgeResult;
  try {
    if (state.burnTxHash && state.attestationData) {
      result = (await kit.retryBridge(state.attestationData as any, {
        from: wired.adapter,
      })) as SdkBridgeResult;
    } else if (state.burnTxHash) {
      throw new Error(
        `This bridge already burned ${state.burnTxHash}. The previous App Kit result is missing, so AGFusion will not submit another burn. Start recovery from the existing bridge activity.`,
      );
    } else {
      result = (await kit.bridge({
        from: {
          adapter: wired.adapter,
          chain: params.fromChain,
        },
        to: {
          chain: params.toChain,
          recipientAddress: recipient,
          useForwarder: true,
        },
        amount: params.amount,
        token: "USDC",
      })) as SdkBridgeResult;
    }
  } catch (error) {
    const partial = (error as any)?.bridgeResult as SdkBridgeResult | undefined;
    const partialSteps = partial?.steps || [];
    const burnHash = findBurnHash(partialSteps);
    if (partial) {
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

  const burnHash = findBurnHash(result.steps);
  const completed = isForwardedSuccess(result);

  state = {
    ...state,
    burnTxHash: burnHash || state.burnTxHash,
    // Store the complete SDK result so a retry can resume after a transient
    // forwarder/Iris problem without creating another source burn.
    attestationData: result,
    state: completed ? "COMPLETED" : burnHash ? "RECOVERABLE" : "FAILED",
    error: completed ? undefined : "Circle Forwarding Service has not confirmed the destination mint yet.",
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
    throw new Error(failed?.errorMessage || "Circle bridge failed. The source burn will not be repeated automatically.");
  }

  return record;
}
