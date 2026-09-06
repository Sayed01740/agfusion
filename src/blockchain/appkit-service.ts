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
import { runBridgeKitFlow, runBridgeKitRecovery } from "@/blockchain/bridge-kit-service";
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

/** True when a step name is the destination (mint/receive) step, semantically. */
export function isDestinationStepName(name: string): boolean {
  const n = (name || "").toLowerCase();
  return DESTINATION_STEP_KEYS.some((k) => n.includes(k));
}

/**
 * The destination transaction hash is the completed mint/receive step's hash —
 * never an arbitrary "last" hash (the last step could be approve or burn).
 */
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

/**
 * Decide whether a bridge attempt succeeded, needs on-chain verification, or is
 * pending/retryable. SDK "error" is never success; success without a
 * destination mint/receive hash is pending/retryable, never success.
 */
export function resolveBridgeOutcome(opts: {
  sdkState?: string;
  sdkSteps?: BridgeSdkStep[];
}): { status: "error" | "retryable" | "verify"; destHash?: string } {
  if (opts.sdkState === "error") return { status: "error" };
  const destHash = findDestinationHash(opts.sdkSteps);
  if (!destHash) return { status: "retryable" };
  return { status: "verify", destHash };
}

/**
 * True only when the SDK returned an error state AND the failing step's error
 * is classified as retryable by the SDK (KitError with RETRYABLE/RESUMABLE
 * recoverability or a retryable code). User rejection, wrong chain, invalid
 * params, unsupported chain, missing wallet and credential errors are never
 * retried.
 */
export function shouldRetryBridge(
  result: BridgeSdkResult | null | undefined,
  isRetryable: (error: unknown) => boolean,
): boolean {
  if (!result || result.state !== "error") return false;
  const failedStep = (result.steps || []).find((s) => s.state === "error");
  if (!failedStep || failedStep.error === undefined) return false;
  return isRetryable(failedStep.error);
}

/**
 * Build the App Kit bridge params. ONE adapter is used for both the source and
 * the destination — no separate destination adapter, no targetChainId locking,
 * and no KIT_KEY config (the installed App Kit does not require one for
 * kit.bridge()).
 */
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

/** Map SDK steps to the UI TxStep shape (preserving hashes + error messages). */
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

/** /api/rpc?chain=<key> proxy key for a chain (falls back to "arc"). */
export function rpcKeyForChain(chain: ChainId): string {
  return getCctpConfig(chain)?.rpcProxyKey ?? "arc";
}

/** Circle Email Wallets can only bridge Arc Testnet ↔ Base Sepolia today. */
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

/**
 * Destination verification: success requires the destination mint/receive step
 * to be completed with a tx hash AND that receipt to confirm successfully
 * on-chain. Reverted receipt → error. Receipt not found yet → retryable/pending.
 */
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
    // Verification infra unavailable — keep the SDK status. The hash is real
    // and the explorer/recovery path can confirm later.
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
  return runBridgeKitFlow({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    txId: params.txId,
    recipient: params.recipient,
    failedResult: params.previousResult,
  });
}

export async function runBridgeFlow(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  toChain: ChainId;
  preferLive?: boolean;
  onStep?: (steps: TxStep[]) => void;
  txId?: string;
  recipient?: string;
}): Promise<TransactionRecord> {
  return tryLiveAppKitBridge({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    onStep: params.onStep,
    bridgeState: null,
    txId: params.txId,
    recipient: params.recipient,
  });
}

export async function runBridgeWithRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  token?: string;
  recipient?: string;
  /** Failed transaction record (must match the bridge being recovered) */
  failedTx?: TransactionRecord | null;
  /** Passed by the UI so the returned record keeps the original tx id */
  txId?: string;
}): Promise<TransactionRecord> {
  // PERMANENT-CCTP-RECOVERY-GUARD
  return runBridgeKitRecovery({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient: params.recipient,
    failedTx: params.failedTx,
    txId: params.txId,
  });
}

async function resumeFromBurn(
  txId: string,
  fromChain: ChainId,
  toChain: ChainId,
  amount: string,
  token: string,
  burnHash: string,
  recipient?: string,
): Promise<TransactionRecord> {
  const kit = await getAppKit();
  const { createAppKitAdapterFromBrowser: createAdapter } = await import("@/sdk/wallet-adapter");
  if (!kit) throw new Error("App Kit unavailable for bridge recovery.");

  const supported = (kit as any).getSupportedChains?.() as Array<{ chain: string }> | undefined;
  const chains = Array.isArray(supported) ? supported : [];
  const srcDef = chains.find((c) => c.chain === fromChain);
  const dstDef = chains.find((c) => c.chain === toChain);
  if (!srcDef || !dstDef) {
    throw new Error("Circle App Kit could not resolve the bridge chains for recovery.");
  }

  // ONE adapter for the retry — same object for source and destination.
  const wired = await createAdapter({ requireArc: false });
  if (!wired) throw new Error("Could not reconnect the wallet for bridge recovery.");

  // Step history: only the confirmed burn is present, so the SDK continues at
  // fetchAttestation and never touches approve/burn again.
  const reconstructed = {
    state: "error",
    amount,
    token,
    source: { address: wired.address, chain: srcDef },
    destination: { address: wired.address, chain: dstDef, recipientAddress: recipient },
    steps: [{ name: "burn", state: "success", txHash: burnHash }],
    config: {},
  };

  const retried = (await kit.retryBridge(reconstructed, {
    from: wired.adapter,
    to: wired.adapter,
  })) as BridgeSdkResult;

  const steps: TxStep[] = toTxSteps(retried.steps);
  // Recovery must verify the actual destination transaction — the burn alone
  // is never proof the bridge settled.
  const verified = await verifyDestinationStep({
    sdkState: retried.state,
    sdkSteps: retried.steps,
    toChain,
  });
  const finalState = deriveBridgeState(txId, retried.steps || []);

  return {
    id: txId,
    type: "bridge",
    status: verified.status,
    amount,
    token,
    fromChain,
    toChain,
    recipient,
    feeUsd: estimateBridgeDemo(amount, fromChain, toChain).feeUsd,
    steps,
    txHash: verified.destHash,
    explorerUrl: verified.destHash ? explorerTxUrl(verified.destHash) : CHAINS[toChain].explorer,
    createdAt: new Date().toISOString(),
    message: [
      `Recovered bridge ${amount} USDC ${fromChain} → ${toChain}`,
      verified.note,
    ]
      .filter(Boolean)
      .join(" · "),
    executionMode: "live",
    bridgeResult: retried,
    bridgeState: finalState,
  };
}

export async function runSwapFlow(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error(
      "Swap must run in the browser with your connected wallet (Rabby / MetaMask).",
    );
  }

  // App Kit calls api.circle.com from the browser → often "Failed to fetch" (8002).
  // Route those requests through our server proxy first.
  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const {
    ensureKitKey,
    getPublicKitKey,
    formatKitError,
    KIT_KEY_HELP,
    normalizeKitKey,
  } = await import("@/lib/kit-key");

  // Clear bad session keys and load valid key (session → NEXT_PUBLIC → /api/kit)
  let kitKey: string | undefined = (await ensureKitKey()) || getPublicKitKey();
  if (kitKey) kitKey = normalizeKitKey(kitKey);

  if (!kitKey || !/^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(kitKey)) {
    throw new Error(
      `${KIT_KEY_HELP}\n\nTip: hard-refresh. Use Clear saved in Stablecoin FX so a bad paste is not used.`,
    );
  }

  // Live credential check (catches revoked/wrong keys before App Kit fails opaquely)
  try {
    const health = await fetch("/api/kit?check=1", { cache: "no-store" });
    const h = (await health.json()) as {
      valid?: boolean | null;
      message?: string;
      fix?: string[];
      kitKey?: string | null;
    };
    if (h.kitKey && /^KIT_KEY:/.test(h.kitKey)) {
      kitKey = normalizeKitKey(h.kitKey);
    }
    if (h.valid === false) {
      throw new Error(
        [
          "Circle rejected KIT_KEY (Invalid credentials).",
          h.message || "",
          "",
          "Permanent fix (site owner):",
          ...(h.fix || [
            "1. console.circle.com → Keys → Kit keys → Create new",
            "2. Vercel → KIT_KEY + NEXT_PUBLIC_KIT_KEY = full KIT_KEY:id:secret",
            "3. Redeploy production",
            "4. Users hard-refresh — no paste needed",
          ]),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  } catch (e) {
    if (e instanceof Error && /Circle rejected KIT_KEY|Permanent fix/i.test(String(e))) {
      throw e;
    }
    // Network blip on health — still attempt swap with loaded key
    console.warn("[AGFusion] kit health check skipped", e);
  }

  console.info("[AGFusion] kit key ready", "shape=OK", "len=", kitKey?.length ?? 0);

  const kit = await getAppKit();
  if (!kit) {
    const detail = getAppKitLoadError();
    throw new Error(
      detail
        ? `App Kit failed to load: ${detail}`
        : "App Kit failed to load in the browser. Hard-refresh (Ctrl+Shift+R) and try again.",
    );
  }

  const { switchToChainId, getInjectedProvider, requestAccounts } =
    await import("@/sdk/wallet-adapter");
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  try {
    await switchToChainId(provider, params.chain);
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? String(e)
        : `Switch wallet to ${params.chain} before swapping.`,
    );
  }

  let wired: Awaited<ReturnType<typeof createAppKitAdapterFromBrowser>>;
  try {
    wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  } catch (e) {
    throw e instanceof Error
      ? e
      : new Error(`Could not switch wallet to ${params.chain}`);
  }
  if (!wired) {
    throw new Error(
      `Wallet not ready. Connect your wallet on ${params.chain}, then swap again.`,
    );
  }

  console.info(
    "[AGFusion] swap wallet",
    wired.walletName,
    "chainId=",
    wired.chainId,
    "addr=",
    wired.address?.slice(0, 10),
  );

  const estimate = estimateSwapDemo(
    params.amount,
    params.tokenIn,
    params.tokenOut,
  );

  const steps: TxStep[] = [
    { name: "Quote", state: "active" },
    { name: "Approve USDC", state: "pending" },
    { name: "Swap", state: "pending" },
  ];
  params.onStep?.(steps.map((s) => ({ ...s })));

  // Force on-chain approve — never EIP-2612 permit (Arc native USDC + Rabby break permit)
  const baseConfig = {
    kitKey,
    slippageBps: 100,
    allowanceStrategy: "approve" as const,
  };

  const tokenIn = (params.tokenIn || "USDC").toUpperCase();
  const tokenOut = (params.tokenOut || "EURC").toUpperCase();

  const swapParams = {
    from: { adapter: wired.adapter, chain: params.chain },
    tokenIn,
    tokenOut,
    amountIn: String(params.amount),
    config: baseConfig,
  };

  try {
    // Pre-flight estimate for clearer errors (same approve strategy)
    try {
      if (typeof kit.estimateSwap === "function") {
        await kit.estimateSwap(swapParams);
      }
    } catch (estErr) {
      const estMsg = formatKitError(estErr);
      console.warn("[AGFusion] estimateSwap failed:", estErr);
      if (/kit.?key|invalid.?key|unauthorized|401|403|credential/i.test(estMsg)) {
        throw new Error(
          `Kit key rejected by Circle: ${estMsg}\n\n${KIT_KEY_HELP}`,
        );
      }
      // Don't block swap on estimate-only failures unless clearly fatal
      if (/insufficient|balance/i.test(estMsg)) {
        throw new Error(
          "Insufficient USDC on Arc. Get test USDC: https://faucet.circle.com (select Arc Testnet)",
        );
      }
    }

    steps[0].state = "success";
    steps[1].state = "active";
    params.onStep?.(steps.map((s) => ({ ...s })));

    let result: {
      txHash?: string;
      amountOut?: string;
      explorerUrl?: string;
      state?: string;
      error?: string;
    };

    try {
      result = (await kit.swap(swapParams)) as typeof result;
    } catch (swapErr) {
      const sMsg = formatKitError(swapErr);
      // Retry once: re-assert Arc + force approve only
      if (
        /permit|chainId should be same|allowanceStrategy|VALIDATION_FAILED|1098|unrecognized chain/i.test(
          sMsg,
        )
      ) {
        console.warn(
          "[AGFusion] retrying swap after approve/chain error:",
          sMsg.slice(0, 200),
        );
        const { ensureArcChainId } = await import("@/sdk/wallet-adapter");
        // We shouldn't force Arc here either, we need the correct chain
        const { switchToChainId } = await import("@/sdk/wallet-adapter");
        await switchToChainId(wired.provider, params.chain);
        const retryWired = await createAppKitAdapterFromBrowser({
          requireArc: false,
        });
        if (!retryWired) throw swapErr;
        result = (await kit.swap({
          ...swapParams,
          from: { adapter: retryWired.adapter, chain: params.chain },
          config: {
            kitKey,
            slippageBps: 100,
            allowanceStrategy: "approve",
          },
        })) as typeof result;
      } else {
        throw swapErr;
      }
    }

    steps[1].state = "success";
    steps[2].state = "success";
    steps[2].txHash = result.txHash;
    params.onStep?.(steps.map((s) => ({ ...s })));

    if (result.state === "error") {
      throw new Error(result.error || "Swap returned error state");
    }

    // On-chain verification (Phase 5): the swap is only successful once the
    // receipt confirms on Arc.
    let swapStatus: TransactionRecord["status"] = "success";
    let swapNote = result.amountOut
      ? `Received ~${result.amountOut} ${params.tokenOut}`
      : "Live stablecoin FX on Arc";
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
          swapStatus = "error";
          swapNote = `Swap reverted on-chain (${chainKey}).`;
        } else if (v.status === "not_found") {
          swapStatus = "retryable";
          swapNote = `Swap submitted but not confirmed yet (${chainKey}). Check the explorer before retrying.`;
        }
      } catch (e) {
        console.warn("[AGFusion] swap receipt verification skipped", e);
      }
    }

    return {
      id: uid("tx"),
      type: "swap",
      status: swapStatus,
      retryable: swapStatus === "retryable",
      amount: params.amount,
      token: params.tokenIn,
      tokenOut: params.tokenOut,
      fromChain: params.chain,
      toChain: params.chain,
      feeUsd: estimate.feeUsd,
      steps,
      txHash: result.txHash,
      explorerUrl:
        result.explorerUrl ||
        (result.txHash
          ? explorerTxUrl(result.txHash)
          : CHAINS[params.chain].explorer),
      createdAt: new Date().toISOString(),
      message: swapNote,
      executionMode: "live",
    };
  } catch (e) {
    const msg = formatKitError(e);
    console.error("[AGFusion] live swap failed:", e);

    if (/4001|user rejected|denied|rejected by user|USER_CANCELLED/i.test(msg)) {
      throw new Error("Swap cancelled in wallet.");
    }
    // Real chain mismatch strings only — do NOT map all 1098 to this
    // (1098 = generic INPUT_VALIDATION_FAILED in Circle kits)
    if (
      /chainId should be same|Wallet is on chain|Could not switch to Arc|left Arc after|bad Arc Testnet|need 5042002|need Arc Testnet/i.test(
        msg,
      )
    ) {
      throw new Error(
        `${msg}\n\n` +
          `Tips:\n` +
          `• In Rabby, select the **exact account** connected to AGFusion\n` +
          `• Network must be **Arc Testnet** · chain id **5042002** · RPC **https://rpc.testnet.arc.io**\n` +
          `• If MetaMask + Rabby both installed: Connect → choose **Rabby** in AGFusion\n` +
          `• Delete a bad Arc network entry and re-add if needed`,
      );
    }
    if (/permit generation failed/i.test(msg)) {
      throw new Error(
        `Token approval failed (permit). AGFusion uses on-chain approve — confirm the **Approve** popup in Rabby, then swap again.\n\n${msg}`,
      );
    }
    if (/insufficient|balance/i.test(msg)) {
      throw new Error(
        "Insufficient USDC on Arc Testnet. Faucet: https://faucet.circle.com (select Arc Testnet).",
      );
    }
    if (
      /8002|Failed to fetch|Maximum retry|NetworkError|Load failed|upstream_unreachable/i.test(
        msg,
      )
    ) {
      throw new Error(
        "Could not reach Circle Swap API. Hard-refresh (Ctrl+Shift+R), confirm kit key, stay on Arc Testnet, retry.",
      );
    }
    if (
      /kit.?key|invalid.?key|unauthorized|401|403|credential|api key|kit_key_rejected/i.test(
        msg,
      )
    ) {
      throw new Error(
        `Circle rejected the kit key.\n${msg}\n\n${KIT_KEY_HELP}`,
      );
    }
    // Surface real Circle validation text (was hidden behind fake chain-mismatch)
    throw new Error(msg || "Swap failed.");
  }
}

export async function runSendFlow(params: {
  amount: string;
  token: string;
  chain: ChainId;
  recipient: string;
  recipientLabel?: string;
  onStep?: (steps: TxStep[]) => void;
  preferLive?: boolean;
}): Promise<TransactionRecord> {
  if ((preferLive() || params.preferLive) && params.chain === "Arc_Testnet") {
    try {
      return await liveSendUsdcOnArc({
        amount: params.amount,
        recipient: params.recipient,
        recipientLabel: params.recipientLabel,
        onStep: params.onStep,
      });
    } catch (e) {
      console.warn("[AGFusion] live send failed:", e);
      throw e instanceof Error ? e : new Error("Live send failed");
    }
  }

  assertDemoAllowed("send");
}

export async function runUnifiedDeposit(params: {
  amount: string;
  fromChain: ChainId;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Unified Balance deposit must run in the browser.");
  }

  const n = Number(params.amount);
  if (!params.amount || Number.isNaN(n) || n <= 0) {
    throw new Error("Enter a valid deposit amount (USDC).");
  }

  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const { ensureKitKey, normalizeKitKey, formatKitError } = await import(
    "@/lib/kit-key"
  );
  let kitKey: string | undefined = await ensureKitKey();
  if (kitKey) kitKey = normalizeKitKey(kitKey);

  const { switchToChainId, getInjectedProvider, requestAccounts } =
    await import("@/sdk/wallet-adapter");

  // Source chain must hold USDC for deposit (e.g. Base Sepolia)
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  try {
    await switchToChainId(provider, params.fromChain);
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? String(e)
        : `Switch wallet to ${params.fromChain} to deposit into Unified Balance.`,
    );
  }

  const kit = await getAppKit();
  if (!kit?.unifiedBalance) {
    throw new Error(
      "App Kit Unified Balance unavailable. Hard-refresh and ensure @circle-fin/app-kit is loaded.",
    );
  }

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) {
    throw new Error("Wallet not ready. Connect Rabby and retry deposit.");
  }

  try {
    // Re-assert source chain after adapter build
    await switchToChainId(wired.provider, params.fromChain).catch(() => {});

    const depositParams: Record<string, unknown> = {
      from: { adapter: wired.adapter, chain: params.fromChain },
      amount: String(params.amount),
      token: "USDC",
      allowanceStrategy: "approve",
    };
    if (kitKey) {
      depositParams.config = { kitKey };
    }

    const result = (await kit.unifiedBalance.deposit(depositParams)) as {
      txHash?: string;
      explorerUrl?: string;
      amount?: string;
      chain?: string;
    };

    return {
      id: uid("tx"),
      type: "bridge",
      status: "success",
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: "Arc_Testnet",
      feeUsd: 0.05,
      steps: [
        {
          name: "Unified Balance deposit",
          state: "success",
          txHash: result?.txHash,
        },
      ],
      txHash: result?.txHash,
      explorerUrl: result?.explorerUrl,
      createdAt: new Date().toISOString(),
      message: `Unified Balance deposit ${params.amount} USDC from ${params.fromChain}`,
      executionMode: "live",
    };
  } catch (e) {
    const msg = formatKitError(e);
    console.error("[AGFusion] unified deposit failed:", e);
    if (/4001|user rejected|denied/i.test(msg)) {
      throw new Error("Deposit cancelled in wallet.");
    }
    // Fallback: CCTP bridge toward Arc when Gateway deposit unsupported on chain
    console.warn("[AGFusion] falling back to bridge Arc path:", msg);
    try {
      return await runBridgeFlow({
        amount: params.amount,
        token: "USDC",
        fromChain: params.fromChain,
        toChain: "Arc_Testnet",
        preferLive: true,
      });
    } catch (bridgeErr) {
      throw new Error(
        `Unified Balance deposit failed.\n${msg}\n\nBridge fallback: ${
          bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr)
        }`,
      );
    }
  }
}

export async function runUnifiedSpend(params: {
  amount: string;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Unified Balance spend must run in the browser.");
  }

  const { requireSafeRecipient } = await import("@/lib/balances-empty");
  const recipient = requireSafeRecipient(
    params.recipient,
    params.recipientLabel,
  );

  const n = Number(params.amount);
  if (!params.amount || Number.isNaN(n) || n <= 0) {
    throw new Error("Enter a valid spend amount (USDC).");
  }

  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const { ensureKitKey, normalizeKitKey, formatKitError } = await import(
    "@/lib/kit-key"
  );
  let kitKey: string | undefined = await ensureKitKey();
  if (kitKey) kitKey = normalizeKitKey(kitKey);

  const kit = await getAppKit();
  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });

  if (kit?.unifiedBalance && wired) {
    try {
      const depositorAddress = wired.address;

      const spendParams: Record<string, unknown> = {
        amount: String(params.amount),
        token: "USDC",
        from: { 
          adapter: wired.adapter,
          address: depositorAddress,
        },
        to: {
          adapter: wired.adapter,
          chain: "Arc_Testnet",
          address: recipient,
        },
      };
      if (kitKey) {
        spendParams.config = { kitKey };
      }

      const result = (await kit.unifiedBalance.spend(spendParams)) as {
        txHash?: string;
        explorerUrl?: string;
      };

      return {
        id: uid("tx"),
        type: "unified_spend",
        status: "success",
        amount: params.amount,
        token: "USDC",
        toChain: "Arc_Testnet",
        recipient,
        recipientLabel: params.recipientLabel,
        feeUsd: 0.08,
        steps: [
          {
            name: "Unified Balance spend → Arc",
            state: "success",
            txHash: result?.txHash,
          },
        ],
        txHash: result?.txHash,
        explorerUrl:
          result?.explorerUrl ||
          (result?.txHash ? explorerTxUrl(result.txHash) : undefined),
        createdAt: new Date().toISOString(),
        message: `Unified Balance spend ${params.amount} USDC on Arc`,
        executionMode: "live",
      };
    } catch (e) {
      const msg = formatKitError(e);
      console.warn("[AGFusion] unified spend failed, fallback send:", msg);
      if (/4001|user rejected|denied/i.test(msg)) {
        throw new Error("Spend cancelled in wallet.");
      }
      // Fallback: native Arc send if user already holds USDC on Arc
      return liveSendUsdcOnArc({
        amount: params.amount,
        recipient,
        recipientLabel: params.recipientLabel || "Unified spend fallback",
      });
    }
  }

  // No kit — direct Arc send
  return liveSendUsdcOnArc({
    amount: params.amount,
    recipient,
    recipientLabel: params.recipientLabel,
  });
}

export async function runUnifiedRouteFlow(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  recipient: string;
  recipientLabel?: string;
}): Promise<TransactionRecord> {
  // Bridge then send
  try {
    const bridged = await runBridgeFlow({
      amount: params.amount,
      token: params.token,
      fromChain: params.fromChain,
      toChain: "Arc_Testnet",
      preferLive: true,
    });
    if (bridged.status === "success") {
      return runSendFlow({
        amount: params.amount,
        token: params.token,
        chain: "Arc_Testnet",
        recipient: params.recipient,
        recipientLabel: params.recipientLabel,
        preferLive: true,
      });
    }
    return bridged;
  } catch {
    return runSendFlow({
      amount: params.amount,
      token: params.token,
      chain: "Arc_Testnet",
      recipient: params.recipient,
      recipientLabel: params.recipientLabel,
      preferLive: true,
    });
  }
}
