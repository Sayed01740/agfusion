import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, switchToChainId, getChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { recordBridgeDebug } from "@/lib/bridge-debug";
import { initBridgeState, loadBridgeState, saveBridgeState, type BridgeState } from "@/lib/bridge-state";

type SdkStep = { name?: string; state?: string; txHash?: string; errorMessage?: string; error?: unknown; [key: string]: unknown };
type SdkBridgeResult = { state?: "pending" | "success" | "error" | string; steps?: SdkStep[]; amount?: string; source?: unknown; destination?: unknown; provider?: string; [key: string]: unknown };

function stepName(step: SdkStep): string { return String(step.name || "step").toLowerCase(); }
function findStep(steps: SdkStep[] | undefined, names: string[]): SdkStep | undefined { return [...(steps || [])].reverse().find((step) => names.some((name) => stepName(step).includes(name))); }
function findHash(steps: SdkStep[] | undefined, names: string[]): string | undefined { return findStep(steps, names)?.txHash; }
function toTxSteps(steps: SdkStep[] | undefined): TxStep[] { return (steps || []).map((step) => ({ name: step.name || "Bridge step", state: step.state === "success" ? "success" : step.state === "error" ? "error" : step.state === "pending" ? "pending" : "success", txHash: step.txHash, message: step.errorMessage })); }
function assertRoute(fromChain: ChainId, toChain: ChainId): void { if (!CIRCLE_BRIDGE_CHAINS.includes(fromChain) || !CIRCLE_BRIDGE_CHAINS.includes(toChain)) throw new Error("Circle Email Wallet currently supports Arc Testnet ↔ Base Sepolia bridging."); if (fromChain === toChain) throw new Error("Source and destination must be different chains."); }
function assertAddress(address: string): void { if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Bridge recipient must be a valid EVM address."); }
function isCompleted(result: SdkBridgeResult): boolean { if (result.state !== "success") return false; const mint = findStep(result.steps, ["mint", "receive", "destination"]); return mint?.state === "success" && !!mint.txHash; }
function buildRecord(result: SdkBridgeResult, state: BridgeState, params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient: string }): TransactionRecord {
  const steps = toTxSteps(result.steps); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const burnHash = findHash(result.steps, ["burn"]); const completed = isCompleted(result);
  return { id: state.txId, type: "bridge", status: completed ? "success" : result.state === "error" ? "error" : "retryable", retryable: !completed && result.state !== "error", amount: params.amount, token: "USDC", fromChain: params.fromChain, toChain: params.toChain, recipient: params.recipient, feeUsd: 0, steps: steps.length > 0 ? steps : [{ name: "CCTP bridge", state: completed ? "success" : "pending" }], txHash: mintHash || burnHash, explorerUrl: mintHash ? (params.toChain === "Base_Sepolia" ? `https://sepolia.basescan.org/tx/${mintHash}` : `https://testnet.arcscan.app/tx/${mintHash}`) : burnHash ? (params.fromChain === "Arc_Testnet" ? `https://testnet.arcscan.app/tx/${burnHash}` : `https://sepolia.basescan.org/tx/${burnHash}`) : undefined, createdAt: new Date(state.createdAt).toISOString(), message: completed ? `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Destination mint confirmed.` : result.state === "error" ? findStep(result.steps, ["error"])?.errorMessage || "Bridge failed." : "Bridge is waiting for destination mint confirmation.", executionMode: "live", bridgeResult: result, bridgeState: state };
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
  const walletAddress = meta.address || ""; assertAddress(walletAddress); const recipient = params.recipient || walletAddress; assertAddress(recipient);
  const kit = await getAppKit(); log("appkit.loaded", { loaded: !!kit, bridgeType: typeof kit?.bridge, retryBridgeType: typeof kit?.retryBridge });
  if (!kit) throw new Error("Circle App Kit failed to load. Hard-refresh and reconnect the wallet.");

  // IMPORTANT: Circle App Kit can receive different adapters for source and
  // destination. A single unbound adapter can report the source chain to both
  // viem clients, which prevents the destination mint from ever reaching the
  // wallet signer. We therefore create two chain-locked adapters backed by the
  // same selected wallet/provider. Each proxy switches the wallet immediately
  // before eth_chainId/eth_sendTransaction for its own chain.
  let sourceWired: Awaited<ReturnType<typeof createAppKitAdapterFromBrowser>>;
  let destinationWired: Awaited<ReturnType<typeof createAppKitAdapterFromBrowser>>;
  try {
    sourceWired = await createAppKitAdapterFromBrowser({ requireArc: false, targetChainId: EVM_CHAIN_PARAMS[params.fromChain].chainId });
    log("source.adapter.created", { ok: !!sourceWired?.adapter, chainId: sourceWired?.chainId, walletName: sourceWired?.walletName });
    if (!sourceWired?.adapter) throw new Error("Could not create the source-chain Circle adapter.");

    destinationWired = await createAppKitAdapterFromBrowser({ requireArc: false, targetChainId: EVM_CHAIN_PARAMS[params.toChain].chainId });
    log("destination.adapter.created", { ok: !!destinationWired?.adapter, chainId: destinationWired?.chainId, walletName: destinationWired?.walletName });
    if (!destinationWired?.adapter) throw new Error("Could not create the destination-chain Circle adapter.");

    const current = await getChainId(destinationWired.provider);
    log("destination.adapter.ready", { expected: EVM_CHAIN_PARAMS[params.toChain].chainId, currentChainId: current, targetChainId: EVM_CHAIN_PARAMS[params.toChain].chainId });
  } catch (e) {
    log("adapter.creation.error", e, e instanceof Error ? e.message : String(e));
    throw e instanceof Error ? e : new Error(String(e));
  }

  const txId = params.txId || debugId;
  let state = params.txId ? loadBridgeState(params.txId) : null;
  if (!state) state = initBridgeState({ txId, walletType: "circle", walletAddress, fromChain: params.fromChain, toChain: params.toChain, token: "USDC", amount: params.amount, recipient });
  log("bridge.state.before", state);

  try {
    log("appkit.bridge.call", { from: { chain: params.fromChain, chainId: EVM_CHAIN_PARAMS[params.fromChain].chainId, hasAdapter: true }, to: { chain: params.toChain, chainId: EVM_CHAIN_PARAMS[params.toChain].chainId, hasAdapter: true, recipientAddress: recipient }, amount: params.amount, token: "USDC", useForwarder: false });
    const result = (await kit.bridge({
      from: { adapter: sourceWired.adapter, chain: params.fromChain },
      to: { adapter: destinationWired.adapter, chain: params.toChain, recipientAddress: recipient },
      amount: params.amount,
      token: "USDC",
    })) as SdkBridgeResult;

    log("appkit.bridge.return", { state: result?.state, provider: result?.provider, amount: result?.amount, stepCount: result?.steps?.length, steps: result?.steps, source: result?.source, destination: result?.destination, result });
    const burnHash = findHash(result.steps, ["burn"]); const mintHash = findHash(result.steps, ["mint", "receive", "destination"]); const completed = isCompleted(result);
    log("bridge.result.analysis", { burnHash, mintHash, completed, stepNames: (result.steps || []).map((s) => ({ name: s.name, state: s.state, txHash: s.txHash, errorMessage: s.errorMessage })) });
    state = { ...state, burnTxHash: burnHash || state.burnTxHash, attestationData: result, state: completed ? "COMPLETED" : burnHash ? "RECOVERABLE" : "FAILED", error: completed ? undefined : "Destination mint has not been confirmed yet.", updatedAt: Date.now() };
    saveBridgeState(state); log("bridge.state.after", state);
    const record = buildRecord(result, state, { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient });
    log("bridge.record.created", { status: record.status, retryable: record.retryable, txHash: record.txHash, steps: record.steps, message: record.message });
    if (!completed && result.state === "error") { const failed = result.steps?.find((step) => step.state === "error"); log("bridge.failed", { failedStep: failed }, failed?.errorMessage || "Circle CCTP bridge failed."); throw new Error(failed?.errorMessage || "Circle CCTP bridge failed. Existing burn will not be repeated automatically."); }
    return record;
  } catch (error) {
    log("appkit.bridge.throw", error, error instanceof Error ? error.message : String(error));
    const partial = (error as any)?.bridgeResult as SdkBridgeResult | undefined; log("appkit.bridge.partial", partial);
    if (partial) { const burnHash = findHash(partial.steps, ["burn"]); state = { ...state, burnTxHash: burnHash || state.burnTxHash, attestationData: partial, state: burnHash ? "RECOVERABLE" : "FAILED", error: error instanceof Error ? error.message : String(error), updatedAt: Date.now() }; saveBridgeState(state); log("bridge.recovery.state.saved", state); }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
