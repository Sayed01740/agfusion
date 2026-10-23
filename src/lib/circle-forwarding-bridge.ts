import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { explorerTxUrl } from "@/lib/arc-chain";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, getInjectedProvider, switchToChainId, getChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { attachBridgeProviderDiagnostics, installBridgeGlobalDiagnostics, recordBridgeDebug, startBridgeDebugSession } from "@/lib/bridge-debug";
import { initBridgeState, loadBridgeState, saveBridgeState, type BridgeState } from "@/lib/bridge-state";
import { finalizeVerifiedTransaction } from "@/lib/financial-receipt";

type SdkStep = { name?: string; state?: string; txHash?: string; errorMessage?: string; error?: unknown; forwarded?: boolean; explorerUrl?: string; data?: unknown; [key: string]: unknown };
type SdkBridgeResult = { state?: "pending" | "success" | "error" | string; steps?: SdkStep[]; amount?: string; source?: unknown; destination?: unknown; provider?: string; [key: string]: unknown };
function stepName(step: SdkStep): string { return String(step.name || "step").toLowerCase(); }
function findStep(steps: SdkStep[] | undefined, names: string[]): SdkStep | undefined { return [...(steps || [])].reverse().find((step) => names.some((name) => stepName(step).includes(name))); }
function findHash(steps: SdkStep[] | undefined, names: string[]): string | undefined { return findStep(steps, names)?.txHash; }
function toTxSteps(steps: SdkStep[] | undefined): TxStep[] { return (steps || []).map((step) => { const destinationStep = /mint|receive|destination/i.test(step.name || ""); const awaitingReceiptProof = destinationStep && step.state === "success"; return { name: step.name || "Bridge step", state: awaitingReceiptProof ? "pending" : step.state === "success" ? "success" : step.state === "error" ? "error" : step.state === "noop" ? "success" : "pending", txHash: step.txHash, message: awaitingReceiptProof ? "Circle SDK reported the destination mint; awaiting on-chain receipt and settlement verification." : step.errorMessage }; }); }
function assertRoute(fromChain: ChainId, toChain: ChainId): void { if (!CIRCLE_BRIDGE_CHAINS.includes(fromChain) || !CIRCLE_BRIDGE_CHAINS.includes(toChain)) throw new Error("Circle Forwarding Service supports only configured CCTP routes."); if (fromChain === toChain) throw new Error("Source and destination must be different chains."); }
function assertAddress(address: string): void { if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Bridge recipient must be a valid EVM address."); }
function isCompleted(result: SdkBridgeResult): boolean { const mint = findStep(result.steps, ["mint", "receive", "destination"]); return result.state === "success" && !!mint && mint.state === "success"; }
function buildRecord(result: SdkBridgeResult, state: BridgeState, params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string }): TransactionRecord {
  const steps = toTxSteps(result.steps); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const burnHash = findHash(result.steps, ["burn"]); const completed = isCompleted(result);
  return { id: state.txId, type: "bridge", status: "retryable", retryable: true, amount: params.amount, token: "USDC", fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient, feeUsd: 0, steps: steps.length ? steps : [{ name: "CCTP bridge", state: "pending" }], txHash: mintHash || burnHash, explorerUrl: mintHash ? explorerTxUrl(mintHash, params.toChain as string) : burnHash ? explorerTxUrl(burnHash, params.fromChain as string) : undefined, createdAt: new Date(state.createdAt).toISOString(), message: completed ? `Circle SDK reported a destination mint for ${params.amount} USDC ${params.fromChain} → ${params.toChain}; verifying the destination receipt on-chain.` : result.state === "error" ? findStep(result.steps, ["error"])?.errorMessage || "Bridge failed." : "Source burn confirmed; Circle Forwarding Service has not yet confirmed the destination mint.", executionMode: "live", bridgeResult: result, bridgeState: state };
}

export async function runCircleEmailWalletForwardingBridge(params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient?: string; txId?: string }): Promise<TransactionRecord> {
  const debugId = startBridgeDebugSession(params.txId, { action: "circle-cctp-forwarded-bridge", amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient });
  const stopGlobal = installBridgeGlobalDiagnostics(debugId); const log = (stage: string, data?: unknown, message?: string) => recordBridgeDebug(stage, data, debugId, message);
  let wildcardHandler: ((payload: unknown) => void) | null = null; let kit: Awaited<ReturnType<typeof getAppKit>> = null;
  try {
    log("bridge.start", { params, diagnosticVersion: 5 });
    if (typeof window === "undefined") throw new Error("Circle bridge must run in the browser.");
    assertRoute(params.fromChain, params.toChain);
    const meta = getActiveWalletMeta(); log("wallet.meta", { uuid: meta?.uuid, address: meta?.address, walletType: (meta as any)?.walletType, chainId: (meta as any)?.chainId });
    if (meta?.uuid !== "circle-pw") throw new Error("Circle Email Wallet bridge path requires the active Circle Email Wallet.");
    const walletAddress = meta.address || ""; assertAddress(walletAddress); const recipient = params.recipient || walletAddress; assertAddress(recipient);
    kit = await getAppKit(); log("appkit.loaded", { loaded: !!kit, bridgeType: typeof kit?.bridge, retryBridgeType: typeof kit?.retryBridge, keys: kit ? Object.keys(kit as object) : [] });
    if (!kit || typeof kit.bridge !== "function") throw new Error("Circle App Kit bridge function is unavailable.");
    const sourceChainId = EVM_CHAIN_PARAMS[params.fromChain].chainId;
    const provider = await getInjectedProvider();
    attachBridgeProviderDiagnostics(provider, "bridge-wallet", debugId);
    await switchToChainId(provider, params.fromChain);
    const initialChain = await getChainId(provider); log("source.chain.verified", { expected: sourceChainId, actual: initialChain });
    if (initialChain !== sourceChainId) throw new Error(`Wallet is not on source chain ${params.fromChain} (${sourceChainId}).`);
    const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
    if (!wired?.adapter) throw new Error("Could not create the Circle EIP-1193 adapter.");
    log("adapter.ready", { sourceChain: params.fromChain, sourceChainId, destinationChain: params.toChain, walletName: wired.walletName, forwarding: true, destinationAdapter: false });
    wildcardHandler = (payload: unknown) => log("sdk.event.*", payload);
    kit.on("*", wildcardHandler);
    log("sdk.listeners.installed", { events: ["bridge.approve", "bridge.burn", "bridge.fetchAttestation", "bridge.mint", "*"] });
    const txId = params.txId || debugId; let state = params.txId ? loadBridgeState(params.txId) : null;
    if (!state) state = initBridgeState({ txId, walletType: "circle", walletAddress, fromChain: params.fromChain, toChain: params.toChain, token: "USDC", amount: params.amount, recipient });
    log("bridge.state.before", state);
    const bridgeArgs = { from: { adapter: wired.adapter, chain: params.fromChain }, to: { recipientAddress: recipient, chain: params.toChain, useForwarder: true }, amount: params.amount, token: "USDC" };
    log("appkit.bridge.about_to_call", { architecture: "source adapter + Circle Forwarding Service", forwarding: true, destinationWalletSignature: false, argsSummary: { fromChain: params.fromChain, toChain: params.toChain, amount: params.amount, token: "USDC", recipient } });
    const result = (await kit.bridge(bridgeArgs)) as SdkBridgeResult;
    log("appkit.bridge.return", result);
    const burnHash = findHash(result.steps, ["burn"]); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const completed = isCompleted(result);
    log("bridge.result.analysis", { state: result.state, burnHash, mintHash, completed, forwarding: true, steps: result.steps });
    state = { ...state, burnTxHash: burnHash || state.burnTxHash, destinationTxHash: mintHash || state.destinationTxHash, attestationData: result, state: mintHash ? "DESTINATION_PENDING" : burnHash ? "RECOVERABLE" : result.state === "error" ? "FAILED" : "RECOVERABLE", error: mintHash ? "Destination receipt is awaiting on-chain verification." : "Destination mint has not been confirmed yet.", updatedAt: Date.now() }; saveBridgeState(state);
    const record = buildRecord(result, state, { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient });
    log("bridge.record.created", { status: record.status, txHash: record.txHash, steps: record.steps, message: record.message });
    if (!completed && result.state === "error") { const failed = result.steps?.find((step) => step.state === "error"); throw new Error(failed?.errorMessage || "Circle CCTP bridge failed."); }
    if (!mintHash) return { ...record, status: "retryable", retryable: true, message: "Circle SDK did not provide a destination transaction hash; settlement remains pending and will not be marked successful." };
    const candidate = { ...record, status: "retryable" as const, retryable: true, txHash: mintHash, bridgeResult: { ...result, forwardTxHash: mintHash } };
    const verified = await finalizeVerifiedTransaction(candidate, params.toChain);
    if (verified.status === "success") {
      const completedState = { ...state, state: "COMPLETED" as const, destinationTxHash: mintHash, error: undefined, updatedAt: Date.now() };
      saveBridgeState(completedState);
      const verifiedSteps = (verified.steps || []).map((step) =>
        /mint|receive|destination/i.test(step.name || "") && step.txHash?.toLowerCase() === mintHash.toLowerCase()
          ? { ...step, state: "success" as const, message: "Destination mint receipt and canonical USDC settlement verified on-chain." }
          : step,
      );
      return { ...verified, steps: verifiedSteps, bridgeState: completedState };
    }
    const pendingState = { ...state, state: "DESTINATION_PENDING" as const, destinationTxHash: mintHash, error: verified.message, updatedAt: Date.now() };
    saveBridgeState(pendingState);
    return { ...verified, bridgeState: pendingState };
  } catch (error) { log("bridge.fatal", { error }, error instanceof Error ? error.message : String(error)); throw error instanceof Error ? error : new Error(String(error)); }
  finally { if (wildcardHandler && kit) { try { kit.off("*", wildcardHandler); } catch {} } stopGlobal(); log("diagnostics.end"); }
}
