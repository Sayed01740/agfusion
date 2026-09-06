/**
 * Arc App Kit service layer — live paths in the browser.
 */

import type {
  BridgeEstimate,
  ChainId,
  SwapEstimate,
  TransactionRecord,
  TxStep,
} from "@/types";
import { CHAINS } from "@/lib/chains";
import { CIRCLE_BRIDGE_CHAINS, getCctpConfig } from "@/lib/cctp-chains";
import { uid } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/arc-chain";
import { getAppKit, getAppKitLoadError } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser } from "@/sdk/wallet-adapter";
import { liveSendUsdcOnArc } from "@/blockchain/live-send";
import {
  deriveBridgeState,
  initBridgeState,
  isBurnConfirmed,
  loadBridgeState,
  saveBridgeState,
  type BridgeState,
} from "@/lib/bridge-state";

function preferLive(): boolean {
  return true;
}

function assertDemoAllowed(context: string): never {
  throw new Error(
    `${context}: Connect a wallet on Arc Testnet to execute live transfers.`,
  );
}

export function estimateBridgeDemo(
  amount: string,
  from: ChainId,
  to: ChainId,
): BridgeEstimate {
  const n = Number(amount) || 0;
  return {
    amount,
    feeUsd: Math.max(0.05, n * 0.0008),
    gasUsd: 0.04,
    eta: from === "Ethereum_Sepolia" ? "~45s" : "~18s",
    route: `${CHAINS[from].short} → ${CHAINS[to].short}`,
    speed: "fast",
    estimated: true,
    note: "Indicative estimate — actual fees settle on-chain at execution.",
  };
}

export function estimateSwapDemo(
  amountIn: string,
  tokenIn: string,
  tokenOut: string,
): SwapEstimate {
  const n = Number(amountIn) || 0;
  const rate = tokenOut === "EURC" ? 0.92 : 1;
  return {
    amountIn,
    amountOut: (n * rate * 0.999).toFixed(2),
    tokenIn,
    tokenOut,
    feeUsd: Math.max(0.02, n * 0.001),
    slippageBps: 50,
    route: "Best available liquidity",
    estimated: true,
    note: "Indicative estimate — the actual rate is quoted on-chain at swap time.",
  };
}

// ---------------------------------------------------------------------------
// Bridge orchestration helpers (pure + unit-testable)
// ---------------------------------------------------------------------------

export interface BridgeSdkStep {
  name?: string;
  state?: string;
  txHash?: string;
  errorMessage?: string;
  error?: unknown;
}

export interface BridgeSdkResult {
  state?: "pending" | "success" | "error";
  steps?: BridgeSdkStep[];
  amount?: string;
}

const DESTINATION_STEP_KEYS = ["mint", "receive", "destination", "deposit"];

export function isDestinationStepName(name: string): boolean {
  const n = (name || "").toLowerCase();
  return DESTINATION_STEP_KEYS.some((k) => n.includes(k));
}

export function findDestinationHash(
  steps: BridgeSdkStep[] | undefined,
): string | undefined {
  return [...(steps || [])]
    .reverse()
    .find(
      (s) =>
        isDestinationStepName(s.name || "") &&
        s.state === "success" &&
        !!s.txHash,
    )?.txHash;
}

export function resolveBridgeOutcome(opts: {
  sdkState?: string;
  sdkSteps?: BridgeSdkStep[];
}): { status: "error" | "retryable" | "verify"; destHash?: string } {
  if (opts.sdkState === "error") return { status: "error" };
  const destHash = findDestinationHash(opts.sdkSteps);
  if (!destHash) return { status: "retryable" };
  return { status: "verify", destHash };
}

export function shouldRetryBridge(
  result: BridgeSdkResult | null | undefined,
  isRetryable: (error: unknown) => boolean,
): boolean {
  if (!result || result.state !== "error") return false;
  const failedStep = (result.steps || []).find((s) => s.state === "error");
  if (!failedStep || failedStep.error === undefined) return false;
  return isRetryable(failedStep.error);
}

export function buildBridgeParams(opts: {
  fromChain: ChainId;
  toChain: ChainId;
  amount: string;
  recipient?: string;
  adapter: unknown;
}): Record<string, unknown> {
  return {
    from: {
      chain: opts.fromChain,
      adapter: opts.adapter,
    },
    to: {
      chain: opts.toChain,
      ...(opts.recipient ? { recipientAddress: opts.recipient } : {}),
      adapter: opts.adapter,
    },
    amount: opts.amount,
    token: "USDC",
  };
}

export function toTxSteps(sdkSteps: BridgeSdkStep[] | undefined): TxStep[] {
  return (sdkSteps || []).map((s) => ({
    name: s.name || "Step",
    state:
      s.state === "success"
        ? "success"
        : s.state === "error"
          ? "error"
          : s.state === "pending"
            ? "pending"
            : "success",
    txHash: s.txHash,
    message: s.errorMessage,
  }));
}

export function rpcKeyForChain(chain: ChainId): string {
  return getCctpConfig(chain)?.rpcProxyKey ?? "arc";
}

export function assertCircleBridgeChains(from: ChainId, to: ChainId): void {
  if (
    !CIRCLE_BRIDGE_CHAINS.includes(from) ||
    !CIRCLE_BRIDGE_CHAINS.includes(to)
  ) {
    throw new Error(
      `Circle Email Wallet supports only Arc Testnet ↔ Base Sepolia bridging. ` +
        `Use a browser wallet (Rabby / MetaMask) for ${from.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}.`,
    );
  }
}

export async function verifyDestinationStep(opts: {
  sdkState?: string;
  sdkSteps?: BridgeSdkStep[];
  toChain: ChainId;
  attempts?: number;
  delayMs?: number;
}): Promise<{
  status: "success" | "error" | "retryable";
  destHash?: string;
  note?: string;
}> {
  const outcome = resolveBridgeOutcome(opts);
  if (outcome.status === "error") return { status: "error" };
  if (outcome.status === "retryable") {
    return {
      status: "retryable",
      note: "The bridge is not confirmed on the destination yet — no destination mint/receive transaction hash was returned. Retry to check; AGFusion will never re-burn.",
    };
  }
  const destHash = outcome.destHash as string;
  const destKey = rpcKeyForChain(opts.toChain);
  try {
    const { verifyReceiptOnChain } = await import("@/lib/tx-verify");
    const v = await verifyReceiptOnChain({
      chainKey: destKey,
      txHash: destHash,
      attempts: opts.attempts ?? 4,
      delayMs: opts.delayMs ?? 2_000,
    });
    if (v.status === "reverted") {
      return {
        status: "error",
        destHash,
        note: `Destination transaction reverted on-chain (${destKey}).`,
      };
    }
    if (v.status === "not_found") {
      return {
        status: "retryable",
        destHash,
        note: `Bridge submitted but the destination transaction is not confirmed yet (${destKey}). Retry to check — AGFusion will never re-burn.`,
      };
    }
    return { status: "success", destHash };
  } catch (e) {
    console.warn("[AGFusion] bridge receipt verification skipped", e);
    return { status: "success", destHash };
  }
}

async function tryLiveAppKitBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  onStep?: (steps: TxStep[]) => void;
  bridgeState?: BridgeState | null;
  previousResult?: unknown;
  txId?: string;
  recipient?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error(
      "Bridge must run in the browser with your connected wallet.",
    );
  }

  if (params.recipient !== undefined && String(params.recipient).trim() !== "") {
    const { requireSafeRecipient } = await import("@/lib/balances-empty");
    params.recipient = requireSafeRecipient(
      params.recipient,
      "bridge recipient",
    );
  } else {
    params.recipient = undefined;
  }

  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const { formatKitError } = await import("@/lib/kit-key");

  const kit = await getAppKit();
  if (!kit) {
    const detail = getAppKitLoadError();
    throw new Error(
      detail
        ? `App Kit failed to load: ${detail}`
        : "App Kit not loaded. Hard-refresh and try again.",
    );
  }

  const { getActiveWalletMeta } = await import("@/sdk/active-wallet");
  const meta = getActiveWalletMeta();
  const isAgent = !!meta?.smartAccountAddress;
  const isCircle = meta?.uuid === "circle-pw";

  if (isCircle) {
    assertCircleBridgeChains(params.fromChain, params.toChain);
  }
  let wiredAdapter: any = undefined;

  const {
    createAppKitAdapterFromBrowser,
    switchToChainId,
    getInjectedProvider: getBridgeProvider,
    requestAccounts: reqAccounts,
    getChainId,
    EVM_CHAIN_PARAMS,
  } = await import("@/sdk/wallet-adapter");

  const bridgeProvider = await getBridgeProvider();
  if (isAgent) {
    await reqAccounts(bridgeProvider);
  }

  try {
    await switchToChainId(bridgeProvider, params.fromChain);
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? e.message
        : `Could not switch the wallet to ${params.fromChain.replace(/_/g, " ")}.`,
    );
  }

  const expectedChainId = EVM_CHAIN_PARAMS[params.fromChain]?.chainId;
  if (expectedChainId) {
    const actual = await getChainId(bridgeProvider).catch(() => -1);
    if (actual !== expectedChainId) {
      throw new Error(
        `Wallet is on chain ${actual}, need ${params.fromChain.replace(/_/g, " ")} (${expectedChainId}) to bridge from it. Switch the network in your wallet and retry.`,
      );
    }
  }

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) {
    throw new Error(
      "Could not connect wallet adapter for bridge. Disconnect and reconnect your wallet, then retry.",
    );
  }
  wiredAdapter = wired.adapter;

  async function assertRpc(label: string, chainQ: string): Promise<void> {
    try {
      const health = await fetch(`/api/rpc?chain=${chainQ}`, {
        cache: "no-store",
      });
      if (health.ok) {
        const j = (await health.json()) as { ok?: boolean; chainId?: string };
        if (j.ok && j.chainId) return;
      }
    } catch {
      /* try POST */
    }

    const ping = await fetch(`/api/rpc?chain=${chainQ}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      cache: "no-store",
    });
    if (!ping.ok) {
      const text = await ping.text().catch(() => "");
      throw new Error(
        `Cannot reach **${label}** RPC via AGFusion proxy (${chainQ}). HTTP ${ping.status}. ${text.slice(0, 160)}`,
      );
    }
  }

  try {
    await assertRpc(params.fromChain.replace(/_/g, " "), rpcKeyForChain(params.fromChain));
    await assertRpc(params.toChain.replace(/_/g, " "), rpcKeyForChain(params.toChain));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg}\n\nOpen https://agfusion.vercel.app/api/rpc?chain=arc in a tab — it should show ok:true. Then hard-refresh and retry.`,
    );
  }

  const stepEvents: Array<{ name?: string; state?: string; txHash?: string; errorMessage?: string }> = [];
  const txIdForState = params.txId ?? params.bridgeState?.txId ?? uid("tx");
  let onBridgeEvent: ((payload: any) => void) | null = null;

  try {
    let bState: BridgeState | null = params.bridgeState ?? null;
    if (!bState && params.txId) {
      bState = loadBridgeState(params.txId);
    }
    if (!bState) {
      bState = initBridgeState({
        txId: txIdForState,
        walletType: isAgent ? "agent" : isCircle ? "circle" : "evm",
        walletAddress: meta?.address ?? null,
        fromChain: params.fromChain,
        toChain: params.toChain,
        token: "USDC",
        amount: String(params.amount),
        recipient: params.recipient,
      });
    }

    const bridgeParams = buildBridgeParams({
      fromChain: params.fromChain,
      toChain: params.toChain,
      amount: String(params.amount),
      recipient: params.recipient,
      adapter: wiredAdapter,
    });

    onBridgeEvent = (payload: any) => {
      const name = (payload?.method || payload?.name || "").toLowerCase();
      const state = (payload?.values?.state || payload?.values?.status || payload?.state || "").toLowerCase();
      const stepName = name.includes("fetchattestation") || name.includes("attest")
        ? "fetchAttestation"
        : name.includes("mint") || name.includes("receive") || name.includes("deposit") || name.includes("destination")
          ? "mint"
          : name.includes("burn")
            ? "burn"
            : name.includes("approve")
              ? "approve"
              : name;
      if (stepName && state) {
        stepEvents.push({
          name: stepName,
          state,
          txHash: payload?.values?.txHash || payload?.txHash,
          errorMessage: payload?.values?.errorMessage || payload?.errorMessage,
        });
        if (state === "success" || state === "error") {
          deriveBridgeState(txIdForState, stepEvents);
        }
      }
    };
    kit.on("*", onBridgeEvent);

    let result = (await kit.bridge(bridgeParams)) as BridgeSdkResult;

    for (const s of result.steps || []) {
      if (s.name && !stepEvents.some((e) => e.name === s.name && e.state === s.state)) {
        stepEvents.push(s);
      }
    }
    deriveBridgeState(txIdForState, stepEvents);

    const { isRetryableError } = await import("@circle-fin/app-kit");
    if (shouldRetryBridge(result, isRetryableError)) {
      console.warn("[AGFusion] Bridge failed with a retryable error — retrying once via kit.retryBridge...");
      try {
        result = (await kit.retryBridge(result, {
          from: wiredAdapter,
          to: wiredAdapter,
        })) as BridgeSdkResult;
        for (const s of result.steps || []) {
          if (s.name && !stepEvents.some((e) => e.name === s.name && e.state === s.state)) {
            stepEvents.push(s);
          }
        }
        deriveBridgeState(txIdForState, stepEvents);
      } catch (retryErr) {
        console.warn("[AGFusion] Bridge retry failed:", retryErr);
      }
    }

    const steps: TxStep[] = toTxSteps(result.steps);

    if (result.state === "error") {
      const errStep = steps.find((s) => s.state === "error");
      const err = new Error(
        errStep?.message ||
          "Bridge returned error. Check USDC on the source chain and try again.",
      );
      (err as any).bridgeResult = result;
      (err as any).bridgeState = deriveBridgeState(txIdForState, stepEvents);
      throw err;
    }

    const finalState = deriveBridgeState(txIdForState, stepEvents);
    const verified = await verifyDestinationStep({
      sdkState: result.state,
      sdkSteps: result.steps,
      toChain: params.toChain,
    });
    const finalStatus: TransactionRecord["status"] = verified.status;
    const verifyNote = verified.note;
    const destHash = verified.destHash;

    return {
      id: txIdForState,
      type: "bridge",
      status: finalStatus,
      retryable: finalStatus === "retryable",
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      feeUsd: estimateBridgeDemo(params.amount, params.fromChain, params.toChain).feeUsd,
      steps:
        steps.length > 0
          ? steps
          : [{ name: "Cross-chain transfer", state: "success" }],
      txHash: destHash,
      explorerUrl: destHash ? explorerTxUrl(destHash) : CHAINS[params.toChain].explorer,
      createdAt: new Date().toISOString(),
      message: [
        `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}`,
        verifyNote,
      ].filter(Boolean).join(" · "),
      executionMode: "live",
      bridgeResult: result,
      bridgeState: finalState,
    };
  } catch (e) {
    const msg = formatKitError(e);
    console.error("[AGFusion] live App Kit bridge failed:", e);

    if (typeof window !== "undefined") {
      let bState = (e as any)?.bridgeState as BridgeState | undefined;
      if (!bState && stepEvents.length > 0) {
        bState = deriveBridgeState(txIdForState, stepEvents, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (bState) {
        saveBridgeState(bState);
        (e as any).bridgeState = bState;
      }
    }

    if (/4001|user rejected|denied|rejected by user/i.test(msg)) {
      throw new Error("Bridge cancelled in wallet.");
    }
    if (/insufficient|balance/i.test(msg)) {
      const srcLabel = params.fromChain.replace(/_/g, " ");
      const extra = isAgent
        ? `\n\n**Note for Circle Email Wallet**: Your Auto-Agent uses a Smart Account (${meta?.smartAccountAddress || "shown in navbar"}). Please copy the address in the top-right and fund it directly on **${srcLabel}**.`
        : `\n\nFaucet for testnet USDC: https://faucet.circle.com (select **${srcLabel}**)`;
      throw new Error(
        `Insufficient USDC/Gas on **${srcLabel}**: ${msg}\n\nBridge pulls funds from the source chain.${extra}`,
      );
    }
    if (/Network connection failed|CONNECTION_FAILED|3001|could not coalesce|fetch failed|Failed to fetch|HTTP request failed/i.test(msg)) {
      const src = params.fromChain.replace(/_/g, " ");
      const dst = params.toChain.replace(/_/g, " ");
      const srcKey = rpcKeyForChain(params.fromChain);
      const dstKey = rpcKeyForChain(params.toChain);
      throw new Error(
        [
          `Could not complete Bridge **${src} → ${dst}**.`,
          "",
          "AGFusion proxies all chain RPCs server-side. Common fixes:",
          "1. Hard-refresh (Ctrl+Shift+R) so the latest proxy code loads",
          `2. Your wallet must stay on **${src}** while approving the burn tx`,
          `3. You need **USDC on ${src}** before bridging`,
          `4. Check /api/rpc?chain=${srcKey} returns ok:true`,
          `5. Check /api/rpc?chain=${dstKey} returns ok:true`,
          "",
          `Detail: ${msg}`,
        ].join("\n"),
      );
    }
    throw new Error(
      msg ||
        `Bridge failed. Connect your wallet · switch to **${params.fromChain.replace(/_/g, " ")}** · confirm USDC balance · try again.`,
    );
  } finally {
    if (onBridgeEvent) {
      try {
        kit.off?.("*", onBridgeEvent);
      } catch {
        /* ignore */
      }
    }
  }
}

async function tryLiveAppKitSend(params: {
  amount: string;
  token: string;
  chain: ChainId;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord | null> {
  try {
    const kit = await getAppKit();
    const wired = await createAppKitAdapterFromBrowser();
    if (!kit || !wired) return null;

    const result = (await kit.send({
      from: { adapter: wired.adapter, chain: params.chain },
      to: params.recipient,
      amount: params.amount,
      token: params.token,
    })) as { txHash?: string; explorerUrl?: string };

    let status: TransactionRecord["status"] = "success";
    let note = "Live send on Arc";
    if (result.txHash) {
      try {
        const { verifyReceiptOnChain } = await import("@/lib/tx-verify");
        const { getCctpConfig } = await import("@/lib/cctp-chains");
        const chainKey = getCctpConfig(params.chain)?.rpcProxyKey ?? "arc";
        const v = await verifyReceiptOnChain({
          chainKey,
          txHash: result.txHash,
          attempts: 3,
          delayMs: 1_500,
        });
        if (v.status === "reverted") {
          status = "error";
          note = `Send reverted on-chain (${chainKey}).`;
        } else if (v.status === "not_found") {
          status = "retryable";
          note = `Send submitted but not confirmed yet (${chainKey}). Check the explorer before retrying.`;
        }
      } catch (e) {
        console.warn("[AGFusion] send receipt verification skipped", e);
      }
    } else {
      status = "retryable";
      note = "Send submitted without a returned hash — verify in the explorer before retrying.";
    }

    return {
      id: uid("tx"),
      type: "send",
      status,
      retryable: status === "retryable",
      amount: params.amount,
      token: params.token,
      fromChain: params.chain,
      toChain: params.chain,
      recipient: params.recipient,
      recipientLabel: params.recipientLabel,
      feeUsd: 0.04,
      steps: [
        { name: "Send", state: status === "error" ? "error" : "success", txHash: result.txHash },
      ],
      txHash: result.txHash,
      explorerUrl:
        result.explorerUrl ||
        (result.txHash ? explorerTxUrl(result.txHash) : CHAINS[params.chain].explorer),
      createdAt: new Date().toISOString(),
      message: note,
      executionMode: "live",
    };
  } catch (e) {
    console.warn("[AGFusion] live App Kit send failed:", e);
    return null;
  }
}

// Keep the public bridge API as an explicit export list. This prevents build-time
// source transforms from accidentally changing the export status of runBridgeFlow.
async function runBridgeFlow(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  toChain: ChainId;
  preferLive?: boolean;
  onStep?: (steps: TxStep[]) => void;
  txId?: string;
  recipient?: string;
}): Promise<TransactionRecord> {
  params.onStep?.([
    { name: "Connect & switch network", state: "active" },
    { name: "Approve / burn", state: "pending" },
    { name: "Mint on destination", state: "pending" },
  ]);

  return tryLiveAppKitBridge({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    onStep: params.onStep,
    bridgeState: params.txId ? loadBridgeState(params.txId) : null,
    previousResult: undefined,
    txId: params.txId,
    recipient: params.recipient,
  });
}

export { runBridgeFlow };

async function verifyBurnReceipt(
  fromChain: ChainId,
  burnTxHash: string,
): Promise<{ status: "success" | "reverted" } | null> {
  if (typeof window === "undefined") return null;
  try {
    const { getCctpConfig } = await import("@/lib/cctp-chains");
    const cfg = getCctpConfig(fromChain);
    if (!cfg) return null;
    const res = await fetch(`/api/rpc?chain=${cfg.rpcProxyKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [burnTxHash],
      }),
      cache: "no-store",
    });
    const data = await res.json();
    const receipt = data?.result;
    if (!receipt) return null;
    return { status: receipt.status === "0x1" ? "success" : "reverted" };
  } catch {
    return null;
  }
}

export async function runBridgeWithRecovery(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  txId?: string;
  failedTx?: string;
  previousResult?: BridgeSdkResult;
}): Promise<TransactionRecord> {
  if (params.previousResult) {
    return tryLiveAppKitBridge({
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      txId: params.txId,
      recipient: params.recipient,
      previousResult: params.previousResult,
    });
  }

  if (params.failedTx) {
    const burnStatus = await verifyBurnReceipt(params.fromChain, params.failedTx);
    if (burnStatus?.status === "success") {
      throw new Error(
        "A source-chain burn is already confirmed. Recovery requires the persisted bridge state/attestation path and will not re-burn funds.",
      );
    }
    if (burnStatus?.status === "reverted") {
      return runBridgeFlow({
        amount: params.amount,
        token: params.token,
        fromChain: params.fromChain,
        toChain: params.toChain,
        txId: params.txId,
        recipient: params.recipient,
      });
    }
  }

  return runBridgeFlow({
    amount: params.amount,
    token: params.token,
    fromChain: params.fromChain,
    toChain: params.toChain,
    txId: params.txId,
    recipient: params.recipient,
  });
}
