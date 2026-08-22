import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, switchToChainId, getChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { recordBridgeDebug } from "@/lib/bridge-debug";
import {
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
  [key: string]: unknown;
};

type SdkBridgeResult = {
  state?: "pending" | "success" | "error" | string;
  steps?: SdkStep[];
  amount?: string;
  source?: unknown;
  destination?: unknown;
  provider?: string;
  [key: string]: unknown;
};

function stepName(step: SdkStep): string { return String(step.name || "step").toLowerCase(); }
function findStep(steps: SdkStep[] | undefined, names: string[]): SdkStep | undefined {
  return [...(steps || [])].reverse().find((step) => names.some((name) => stepName(step).includes(name)));
}
function findHash(steps: SdkStep[] | undefined, names: string[]): string | undefined { return findStep(steps, names)?.txHash; }
function toTxSteps(steps: SdkStep[] | undefined): TxStep[] {
  return (steps || []).map((step) => ({
    name: step.name || "Bridge step",
    state: step.state === "success" ? "success" : step.state === "error" ? "error" : step.state === "pending" ? "pending" : "success",
    txHash: step.txHash,
    message: step.errorMessage,
  }));
}
function assertRoute(fromChain: ChainId, toChain: ChainId): void {
  if (!CIRCLE_BRIDGE_CHAINS.includes(fromChain) || !CIRCLE_BRIDGE_CHAINS.includes(toChain)) throw new Error("Circle Email Wallet currently supports Arc Testnet ↔ Base Sepolia bridging.");
  if (fromChain === toChain) throw new Error("Source and destination must be different chains.");
}
function assertAddress(address: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Bridge recipient must be a valid EVM address.");
}
function isCompleted(result: SdkBridgeResult): boolean {
  if (result.state !== "success") return false;
  const mint = findStep(result.steps, ["mint", "receive", "destination"]);
  return mint?.state === "success" && !!mint.txHash;
}
function buildRecord(result: SdkBridgeResult, state: BridgeState, params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string }): TransactionRecord {
  const steps = toTxSteps(result.steps);
  const mintHash = findHash(result.steps, ["mint", "receive", "destination"]);
  const burnHash = findHash(result.steps, ["burn"]);
  const completed = isCompleted(result);
  return {
    id: state.txId, type: "bridge", status: completed ? "success" : result.state === "error" ? "error" : "retryable", retryable: !completed && result.state !== "error",
    amount: params.amount, token: "USDC", fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient, feeUsd: 0,
    steps: steps.length > 0 ? steps : [{ name: "CCTP bridge", state: completed ? "success" : "pending" }],
    txHash: mintHash || burnHash,
    explorerUrl: mintHash ? (params.toChain === "Base_Sepolia" ? `https://sepolia.basescan.org/tx/${mintHash}` : `https://testnet.arcscan.app/tx/${mintHash}`) : burnHash ? (params.fromChain === "Arc_Testnet" ? `https://testnet.arcscan.app/tx/${burnHash}` : `https://sepolia.basescan.org/tx/${burnHash}`) : undefined,
    createdAt: new Date(state.createdAt).toISOString(),
    message: completed ? `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Destination mint confirmed.` : result.state === "error" ? findStep(result.steps, ["error"])?.errorMessage || "Bridge failed." : "Bridge is waiting for destination mint confirmation.",
    executionMode: "live", bridgeResult: result, bridgeState: state,
  };
}

export async function runCircleEmailWalletForwardingBridge(params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient?: string; txId?: string; }): Promise<TransactionRecord> {
  const debugId = params.txId || uid("tx");
  const log = (stage: string, data?: unknown, message?: string) => recordBridgeDebug(stage, data, debugId, message);
  log("bridge.start", { params: { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient } });

  if (typeof window === "undefined") throw new Error("Circle Email Wallet bridge must run in the browser.");
  assertRoute(params.fromChain, params.toChain);
  const meta = getActiveWalletMeta();
  log("wallet.meta", { uuid: meta?.uuid, address: meta?.address, walletType: meta?.walletType, chainId: meta?.chainId });
  if (meta?.uuid !== "circle-pw") throw new Error("Circle Email Wallet bridge path requires the active Circle Email Wallet.");

  const walletAddress = meta.address || "";
  assertAddress(walletAddress);
  const recipient = params.recipient || walletAddress;
  assertAddress(recipient);
  const kit = await getAppKit();
  log("appkit.loaded", { loaded: !!kit, bridgeType: typeof kit?.bridge, retryBridgeType: typeof kit?.retryBridge });
  if (!kit) throw new Error("Circle App Kit failed to load. Hard-refresh and reconnect the wallet.");

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  log("adapter.created", { hasAdapter: !!wired?.adapter, hasProvider: !!wired?.provider, adapterKeys: wired?.adapter ? Object.keys(wired.adapter as any) : [], providerKeys: wired?.provider ? Object.keys(wired.provider as any) : [] });
  if (!wired?.adapter) throw new Error("Could not create the Circle Email Wallet bridge adapter. Reconnect the wallet and retry.");

  const provider = wired.provider || wired.adapter;
  try {
    log("source.chain.switch.begin", { target: EVM_CHAIN_PARAMS[params.fromChain]?.chainId });
    await switchToChainId(provider as any, params.fromChain);
    const expected = EVM_CHAIN_PARAMS[params.fromChain]?.chainId;
    const actual = await getChainId(provider as any);
    log("source.chain.ready", { expected, actual, chainName: params.fromChain });
    if (expected && actual !== expected) throw new Error(`Wallet is on chain ${actual}, expected ${expected} for ${params.fromChain}.`);
  } catch (e) {
    log("source.chain.error", e, e instanceof Error ? e.message : String(e));
    throw e instanceof Error ? e : new Error(String(e));
  }

  let state = params.txId ? loadBridgeState(params.txId) : null;
  if (!state) state = initBridgeState({ txId: debugId, walletType: "circle", walletAddress, fromChain: params.fromChain, toChain: params.toChain, token: "USDC", amount: params.amount, recipient });
  log("bridge.state.before", state);

  try {
    log("appkit.bridge.call", { from: { chain: params.fromChain, hasAdapter: true }, to: { chain: params.toChain, hasAdapter: true, recipientAddress: recipient }, amount: params.amount, token: "USDC", useForwarder: "omitted" });
    const result = (await kit.bridge({
      from: { adapter: wired.adapter, chain: params.fromChain },
      to: { adapter: wired.adapter, chain: params.toChain, recipientAddress: recipient },
      amount: params.amount,
      token: "USDC",
    })) as SdkBridgeResult;

    log("appkit.bridge.return", { state: result?.state, provider: result?.provider, amount: result?.amount, stepCount: result?.steps?.length, steps: result?.steps, source: result?.source, destination: result?.destination, result });

    const burnHash = findHash(result.steps, ["burn"]);
    const mintHash = findHash(result.steps, ["mint", "receive", "destination"]);
    const completed = isCompleted(result);
    log("bridge.result.analysis", { burnHash, mintHash, completed, stepNames: (result.steps || []).map((s) => ({ name: s.name, state: s.state, txHash: s.txHash, errorMessage: s.errorMessage })) });

    state = { ...state, burnTxHash: burnHash || state.burnTxHash, attestationData: result, state: completed ? "COMPLETED" : burnHash ? "RECOVERABLE" : "FAILED", error: completed ? undefined : "Destination mint has not been confirmed yet.", updatedAt: Date.now() };
    saveBridgeState(state);
    log("bridge.state.after", state);

    const record = buildRecord(result, state, { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient });
    log("bridge.record.created", { status: record.status, retryable: record.retryable, txHash: record.txHash, steps: record.steps, message: record.message });

    if (!completed && result.state === "error") {
      const failed = result.steps?.find((step) => step.state === "error");
      log("bridge.failed", { failedStep: failed }, failed?.errorMessage || "Circle CCTP bridge failed.");
      throw new Error(failed?.errorMessage || "Circle CCTP bridge failed. Existing burn will not be repeated automatically.");
    }
    return record;
  } catch (error) {
    log("appkit.bridge.throw", error, error instanceof Error ? error.message : String(error));
    const partial = (error as any)?.bridgeResult as SdkBridgeResult | undefined;
    log("appkit.bridge.partial", partial);
    if (partial) {
      const burnHash = findHash(partial.steps, ["burn"]);
      state = { ...state, burnTxHash: burnHash || state.burnTxHash, attestationData: partial, state: burnHash ? "RECOVERABLE" : "FAILED", error: error instanceof Error ? error.message : String(error), updatedAt: Date.now() };
      saveBridgeState(state);
      log("bridge.recovery.state.saved", state);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
