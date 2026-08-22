import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, getChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { attachBridgeProviderDiagnostics, installBridgeGlobalDiagnostics, recordBridgeDebug } from "@/lib/bridge-debug";
import { initBridgeState, loadBridgeState, saveBridgeState, type BridgeState } from "@/lib/bridge-state";

type SdkStep = { name?: string; state?: string; txHash?: string; errorMessage?: string; error?: unknown; [key: string]: unknown };
type SdkBridgeResult = { state?: "pending" | "success" | "error" | string; steps?: SdkStep[]; amount?: string; source?: unknown; destination?: unknown; provider?: string; [key: string]: unknown };

function stepName(step: SdkStep): string { return String(step.name || "step").toLowerCase(); }
function findStep(steps: SdkStep[] | undefined, names: string[]): SdkStep | undefined { return [...(steps || [])].reverse().find((step) => names.some((name) => stepName(step).includes(name))); }
function findHash(steps: SdkStep[] | undefined, names: string[]): string | undefined { return findStep(steps, names)?.txHash; }
function toTxSteps(steps: SdkStep[] | undefined): TxStep[] { return (steps || []).map((step) => ({ name: step.name || "Bridge step", state: step.state === "success" ? "success" : step.state === "error" ? "error" : "pending", txHash: step.txHash, message: step.errorMessage })); }
function assertRoute(fromChain: ChainId, toChain: ChainId): void { if (!CIRCLE_BRIDGE_CHAINS.includes(fromChain) || !CIRCLE_BRIDGE_CHAINS.includes(toChain)) throw new Error("Circle Email Wallet currently supports Arc Testnet ↔ Base Sepolia bridging."); if (fromChain === toChain) throw new Error("Source and destination must be different chains."); }
function assertAddress(address: string): void { if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Bridge recipient must be a valid EVM address."); }
function isCompleted(result: SdkBridgeResult): boolean { if (result.state !== "success") return false; const mint = findStep(result.steps, ["mint", "receive", "destination"]); return mint?.state === "success" && !!mint.txHash; }
function buildRecord(result: SdkBridgeResult, state: BridgeState, params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string }): TransactionRecord {
  const steps = toTxSteps(result.steps); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const burnHash = findHash(result.steps, ["burn"]); const completed = isCompleted(result);
  return { id: state.txId, type: "bridge", status: completed ? "success" : result.state === "error" ? "error" : "retryable", retryable: !completed, amount: params.amount, token: "USDC", fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient, feeUsd: 0, steps: steps.length ? steps : [{ name: "CCTP bridge", state: "pending" }], txHash: mintHash || burnHash, explorerUrl: mintHash ? (params.toChain === "Base_Sepolia" ? `https://sepolia.basescan.org/tx/${mintHash}` : `https://testnet.arcscan.app/tx/${mintHash}`) : burnHash ? (params.fromChain === "Arc_Testnet" ? `https://testnet.arcscan.app/tx/${burnHash}` : `https://sepolia.basescan.org/tx/${burnHash}`) : undefined, createdAt: new Date(state.createdAt).toISOString(), message: completed ? `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Destination mint confirmed.` : result.state === "error" ? findStep(result.steps, ["error"])?.errorMessage || "Bridge failed." : "Bridge is waiting for destination mint confirmation.", executionMode: "live", bridgeResult: result, bridgeState: state };
}

export async function runCircleEmailWalletForwardingBridge(params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient?: string; txId?: string; }): Promise<TransactionRecord> {
  const debugId = params.txId || uid("tx");
  const stopGlobal = installBridgeGlobalDiagnostics(debugId);
  const log = (stage: string, data?: unknown, message?: string) => recordBridgeDebug(stage, data, debugId, message);
  try {
    log("bridge.start", { params, diagnosticVersion: 2 });
    if (typeof window === "undefined") throw new Error("Circle Email Wallet bridge must run in the browser.");
    assertRoute(params.fromChain, params.toChain);
    const meta = getActiveWalletMeta();
    log("wallet.meta", { uuid: meta?.uuid, address: meta?.address, walletType: meta?.walletType, chainId: meta?.chainId });
    if (meta?.uuid !== "circle-pw") throw new Error("Circle Email Wallet bridge path requires the active Circle Email Wallet.");
    const walletAddress = meta.address || ""; assertAddress(walletAddress); const recipient = params.recipient || walletAddress; assertAddress(recipient);
    const kit = await getAppKit();
    log("appkit.loaded", { loaded: !!kit, bridgeType: typeof kit?.bridge, retryBridgeType: typeof kit?.retryBridge, keys: kit ? Object.keys(kit as object) : [] });
    if (!kit || typeof kit.bridge !== "function") throw new Error("Circle App Kit bridge function is unavailable.");

    const sourceWired = await createAppKitAdapterFromBrowser({ requireArc: false, targetChainId: EVM_CHAIN_PARAMS[params.fromChain].chainId });
    if (!sourceWired?.adapter) throw new Error("Could not create the source-chain Circle adapter.");
    attachBridgeProviderDiagnostics(sourceWired.provider, "source", debugId);
    log("source.adapter.ready", { chainId: sourceWired.chainId, target: EVM_CHAIN_PARAMS[params.fromChain].chainId, walletName: sourceWired.walletName });

    const destinationWired = await createAppKitAdapterFromBrowser({ requireArc: false, targetChainId: EVM_CHAIN_PARAMS[params.toChain].chainId });
    if (!destinationWired?.adapter) throw new Error("Could not create the destination-chain Circle adapter.");
    attachBridgeProviderDiagnostics(destinationWired.provider, "destination", debugId);
    log("destination.adapter.ready", { chainId: destinationWired.chainId, target: EVM_CHAIN_PARAMS[params.toChain].chainId, walletName: destinationWired.walletName });

    const current = await getChainId(destinationWired.provider);
    log("destination.chain.verified", { expected: EVM_CHAIN_PARAMS[params.toChain].chainId, current });

    const txId = params.txId || debugId;
    let state = params.txId ? loadBridgeState(params.txId) : null;
    if (!state) state = initBridgeState({ txId, walletType: "circle", walletAddress, fromChain: params.fromChain, toChain: params.toChain, token: "USDC", amount: params.amount, recipient });
    log("bridge.state.before", state);

    const bridgeArgs = {
      from: { adapter: sourceWired.adapter, chain: params.fromChain },
      to: { adapter: destinationWired.adapter, chain: params.toChain, recipientAddress: recipient },
      amount: params.amount,
      token: "USDC",
    };
    log("appkit.bridge.about_to_call", { sourceChainId: EVM_CHAIN_PARAMS[params.fromChain].chainId, destinationChainId: EVM_CHAIN_PARAMS[params.toChain].chainId, argsSummary: { fromChain: params.fromChain, toChain: params.toChain, amount: params.amount, token: "USDC", recipient, hasSourceAdapter: true, hasDestinationAdapter: true } });

    const result = (await kit.bridge(bridgeArgs)) as SdkBridgeResult;
    log("appkit.bridge.return", result);
    const burnHash = findHash(result.steps, ["burn"]); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const completed = isCompleted(result);
    log("bridge.result.analysis", { state: result.state, burnHash, mintHash, completed, steps: result.steps });
    state = { ...state, burnTxHash: burnHash || state.burnTxHash, attestationData: result, state: completed ? "COMPLETED" : burnHash ? "RECOVERABLE" : "FAILED", error: completed ? undefined : "Destination mint has not been confirmed yet.", updatedAt: Date.now() };
    saveBridgeState(state);
    const record = buildRecord(result, state, { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient });
    log("bridge.record.created", { status: record.status, retryable: record.retryable, txHash: record.txHash, steps: record.steps, message: record.message });
    if (!completed && result.state === "error") { const failed = result.steps?.find((step) => step.state === "error"); throw new Error(failed?.errorMessage || "Circle CCTP bridge failed."); }
    return record;
  } catch (error) {
    log("bridge.fatal", { error }, error instanceof Error ? error.message : String(error));
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    log("diagnostics.end", { eventCount: "see exported log" });
    stopGlobal();
  }
}
