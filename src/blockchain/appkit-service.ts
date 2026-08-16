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
import { sleep, uid } from "@/lib/utils";
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
  };
}

async function animateSteps(
  names: string[],
  onStep?: (steps: TxStep[]) => void,
  failAt?: number,
): Promise<TxStep[]> {
  const steps: TxStep[] = names.map((name) => ({
    name,
    state: "pending",
  }));
  onStep?.(steps.map((s) => ({ ...s })));

  for (let i = 0; i < steps.length; i++) {
    steps[i].state = "active";
    onStep?.(steps.map((s) => ({ ...s })));
    await sleep(550 + Math.random() * 400);
    if (failAt === i) {
      steps[i].state = "error";
      steps[i].message = "Transient network error (demo)";
      onStep?.(steps.map((s) => ({ ...s })));
      return steps;
    }
    steps[i].state = "success";
    steps[i].txHash =
      `0x${uid("").slice(0, 16)}${"a".repeat(48)}`.slice(0, 66);
    onStep?.(steps.map((s) => ({ ...s })));
  }
  return steps;
}

async function tryLiveAppKitBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  onStep?: (steps: TxStep[]) => void;
  /** Reused for recovery: init/update the persisted state machine (Phase 5/6/7) */
  bridgeState?: BridgeState | null;
  /** SDK result from a previous attempt, used with kit.retryBridge (Phase 7) */
  previousResult?: unknown;
  /** Stable tx id (e.g. the UI placeholder id) so state survives across attempts */
  txId?: string;
  /** Mint recipient (defaults to the connected wallet address) */
  recipient?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error(
      "Bridge must run in the browser with your connected wallet.",
    );
  }

  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const {
    ensureKitKey,
    normalizeKitKey,
    formatKitError,
    KIT_KEY_HELP,
  } = await import("@/lib/kit-key");

  let kitKey = await ensureKitKey();
  if (kitKey) kitKey = normalizeKitKey(kitKey);

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

  // Wallet-type routing guard (Phase 2/12): Circle Email Wallets can only
  // execute Arc ↔ Base today. Fail fast instead of presenting an unsupported
  // Circle wallet challenge.
  if (isCircle) {
    const { CIRCLE_BRIDGE_CHAINS } = await import("@/lib/cctp-chains");
    if (
      !CIRCLE_BRIDGE_CHAINS.includes(params.fromChain) ||
      !CIRCLE_BRIDGE_CHAINS.includes(params.toChain)
    ) {
      throw new Error(
        `Circle Email Wallet supports only Arc Testnet ↔ Base Sepolia bridging. ` +
          `Use a browser wallet (Rabby / MetaMask) for ${params.fromChain.replace(/_/g, " ")} → ${params.toChain.replace(/_/g, " ")}.`,
      );
    }
  }
  let wiredAdapter: any = undefined;
  let wiredDestAdapter: any = undefined;

  // Import wallet adapter utilities once — used in agent/EVM setup AND in the
  // kit.on("*") lifecycle listener for mid-bridge chain switching.
  const {
    createAppKitAdapterFromBrowser,
    switchToChainId,
    getInjectedProvider: getBridgeProvider,
    requestAccounts: reqAccounts,
    EVM_CHAIN_PARAMS,
  } = await import("@/sdk/wallet-adapter");

  // Capture the active provider so we can physically switch chains at each
  // bridge step (burn on fromChain → mint on toChain).
  // eslint-disable-next-line prefer-const
  let bridgeProvider: Awaited<ReturnType<typeof getBridgeProvider>> | null = null;

  if (isAgent) {
    // Headless Agent: pre-switch to source chain before building adapter
    const provider = await getBridgeProvider();
    await reqAccounts(provider);
    bridgeProvider = provider;
    try {
      await switchToChainId(provider, params.fromChain);
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? e.message
          : `Agent failed to switch to ${params.fromChain}.`,
      );
    }
  } else {
    // EVM / Circle Email wallet: physically switch to the source chain BEFORE
    // building the adapter so viem's assertCurrentChain() sees the right chain ID
    // instead of Arc Testnet (5042002) when bridging from e.g. Base Sepolia (84532).
    try {
      bridgeProvider = await getBridgeProvider();
      await switchToChainId(bridgeProvider, params.fromChain);
    } catch (e) {
      console.warn(
        "[AGFusion] Pre-bridge chain switch to",
        params.fromChain,
        "failed:",
        e instanceof Error ? e.message : e,
      );
      // Non-fatal: proxy auto-switch will attempt the switch before each tx
    }
  }

  // Always build wired adapters for every wallet type (EVM + Circle Email + Agent).
  // App Kit needs an explicit adapter to know which provider to use for signing.
  // Without it, App Kit tries window.ethereum internally and fails for Circle wallets
  // and custom-picker EVM wallets that aren't registered in App Kit's own state.
  //
  // Phase 8: each side gets a chain-locked adapter with an explicit targetChainId
  // so the proxy auto-switches the wallet to the right chain before every tx
  // (approve/burn on source, mint on destination). This removes the fragile
  // __agfusion_expected_chain global from the bridge path.
  {
    const fromChainId = EVM_CHAIN_PARAMS[params.fromChain]?.chainId;
    const toChainId = EVM_CHAIN_PARAMS[params.toChain]?.chainId;

    const srcAdapter = await createAppKitAdapterFromBrowser({
      requireArc: false,
      targetChainId: fromChainId,
    });
    if (!srcAdapter) {
      throw new Error(
        "Could not connect wallet adapter for bridge. Disconnect and reconnect your wallet, then retry.",
      );
    }

    // Destination adapter is chain-locked only for user wallets (EVM + Circle).
    // Agent smart accounts do not support mid-bridge physical chain switching,
    // so they reuse the source adapter (the app already locks agents to Arc).
    const dstAdapter =
      !isAgent && toChainId
        ? await createAppKitAdapterFromBrowser({
            requireArc: false,
            targetChainId: toChainId,
          })
        : null;

    wiredAdapter = srcAdapter.adapter;
    wiredDestAdapter = (dstAdapter?.adapter ?? srcAdapter.adapter) as any;

    // Use the wired provider as bridge provider if we couldn't get one earlier
    if (!bridgeProvider) bridgeProvider = srcAdapter.provider;
    if (isAgent) {
      // After adapter build, double-check agent provider is on source chain
      try {
        await switchToChainId(srcAdapter.provider, params.fromChain);
      } catch {
        /* App Kit handles chain switching internally during bridge steps */
      }
    }
  }

  // Hard preflight: source + dest public RPCs must answer eth_chainId
  // Maps ChainId → /api/rpc?chain=<key> proxy key. Source of truth is the
  // shared CCTP config (Sonic is intentionally absent until SDK/network align).
  const { getCctpConfig } = await import("@/lib/cctp-chains");
  const chainQuery = (c: string) => getCctpConfig(c)?.rpcProxyKey ?? "arc";

  async function assertRpc(label: string, chainQ: string): Promise<void> {
    // Prefer GET health endpoint
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
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      cache: "no-store",
    });
    const text = await ping.text();
    let result: string | undefined;
    try {
      result = (JSON.parse(text) as { result?: string }).result;
    } catch {
      /* ignore */
    }
    if (!ping.ok || !result) {
      throw new Error(
        `Cannot reach **${label}** RPC via AGFusion proxy (${chainQ}). HTTP ${ping.status}. ${text.slice(0, 160)}`,
      );
    }
  }

  try {
    await assertRpc(params.fromChain.replace(/_/g, " "), chainQuery(params.fromChain));
    await assertRpc(params.toChain.replace(/_/g, " "), chainQuery(params.toChain));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg}\n\nOpen https://agfusion.vercel.app/api/rpc?chain=arc in a tab — it should show ok:true. Then hard-refresh and retry.`,
    );
  }

  // Ensure kit key — CCTP attestation needs it on many routes
  if (!kitKey || !/^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(kitKey)) {
    throw new Error(
      `Circle kit key missing for bridge.\n\n${KIT_KEY_HELP}`,
    );
  }

  // Track step events so the persisted state machine and the recovery path
  // always have the real per-step hashes — even when kit.bridge() throws
  // (Phase 5/6/7). Declared here so the catch block can persist them.
  const stepEvents: Array<{ name?: string; state?: string; txHash?: string; errorMessage?: string }> = [];
  const txIdForState = params.txId ?? params.bridgeState?.txId ?? uid("tx");

  // Named handler (declared outside try so the finally block can unregister
  // it) — prevents duplicate lifecycle listeners across bridge attempts.
  let onBridgeEvent: ((payload: any) => void) | null = null;

  try {
    // Persist / restore the state machine for this attempt (Phase 5).
    let bState: BridgeState | null = params.bridgeState ?? null;
    if (!bState && params.txId) {
      bState = loadBridgeState(params.txId);
    }
    if (!bState) {
      // Seed the machine so deriveBridgeState never falls back to zeroed data.
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

    const bridgeParams: Record<string, unknown> = {
      from: {
        chain: params.fromChain,
      },
      to: {
        chain: params.toChain,
        ...(params.recipient
          ? { recipientAddress: params.recipient }
          : {}),
      },
      amount: String(params.amount),
      token: "USDC",
      config: { kitKey },
    };

    if (wiredAdapter) {
      (bridgeParams.from as any).adapter = wiredAdapter;
      (bridgeParams.to as any).adapter = wiredDestAdapter ?? wiredAdapter;
    }

    const switchToDestination = () => {
      if (bridgeProvider && params.toChain) {
        switchToChainId(bridgeProvider, params.toChain).catch((e) => {
          console.warn(
            "[AGFusion] Mid-bridge toChain switch failed:",
            e instanceof Error ? e.message : e,
          );
        });
      }
    };

    // Named handler so the lifecycle listener can be removed after the
    // attempt — otherwise repeated bridge attempts stack duplicate listeners.
    onBridgeEvent = (payload: any) => {
      const name = (payload?.method || payload?.name || "").toLowerCase();
      const state = (payload?.values?.state || payload?.values?.status || payload?.state || "").toLowerCase();
      const stepName = name.includes("fetchattestation") || name.includes("attest")
        ? "fetchAttestation"
        : name.includes("mint") || name.includes("receive")
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
        // Persist the state machine as each step completes so reload/recovery
        // can resume from the last confirmed state (Phase 5).
        if (state === "success" || state === "error") {
          deriveBridgeState(txIdForState, stepEvents);
        }
      }
      // Safety net: physically switch the wallet to the destination chain as
      // soon as the burn succeeds or the mint step begins. Primary switching is
      // handled by the chain-locked adapters (Phase 8).
      if (
        (state === "success" && stepName === "burn") ||
        (state === "active" && (stepName === "mint" || stepName.includes("receive")))
      ) {
        switchToDestination();
      }
    };
    kit.on("*", onBridgeEvent);

    // Switch wallet to source chain before bridging (enforce active network matches the source chain)
    const fromChainHex = EVM_CHAIN_PARAMS[params.fromChain]?.chainIdHex;
    if (fromChainHex && bridgeProvider) {
      console.log(`[AGFusion] Switching wallet to source chain ${params.fromChain} (${fromChainHex}) before bridge starts`);
      await bridgeProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: fromChainHex.toLowerCase() }],
      });
    }

    let result = (await kit.bridge(bridgeParams)) as {
      state?: string;
      steps?: Array<{
        name?: string;
        state?: string;
        txHash?: string;
        errorMessage?: string;
      }>;
      amount?: string;
    };

    // Merge SDK steps into the event log for the state machine.
    for (const s of result.steps || []) {
      if (s.name && !stepEvents.some((e) => e.name === s.name && e.state === s.state)) {
        stepEvents.push(s);
      }
    }
    deriveBridgeState(txIdForState, stepEvents);

    if (result.state === "error") {
      console.warn("[AGFusion] Bridge returned error state, attempting recovery via retryBridge...");
      try {
        const retryParams: Record<string, any> = {
          from: wiredAdapter,
          to: wiredDestAdapter ?? wiredAdapter,
        };
        result = (await (kit as any).retryBridge(result, retryParams)) as typeof result;
        for (const s of result.steps || []) {
          if (s.name && !stepEvents.some((e) => e.name === s.name && e.state === s.state)) {
            stepEvents.push(s);
          }
        }
        deriveBridgeState(txIdForState, stepEvents);
      } catch (retryErr) {
        console.warn("[AGFusion] Bridge recovery failed:", retryErr);
      }
    }

    const steps: TxStep[] = (result.steps || []).map((s) => ({
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

    const lastHash = [...steps].reverse().find((s) => s.txHash)?.txHash;
    const ok = result.state !== "error";
    if (!ok) {
      const errStep = steps.find((s) => s.state === "error");
      const err = new Error(
        errStep?.message ||
          "Bridge returned error. Check USDC on the source chain and try again.",
      );
      // Attach the partial SDK result + persisted state so recovery can resume
      // without restarting (Phase 6/7).
      (err as any).bridgeResult = result;
      (err as any).bridgeState = deriveBridgeState(txIdForState, stepEvents);
      throw err;
    }

    // Persist final machine state + full SDK result for safe resume (Phase 7).
    const finalState = deriveBridgeState(txIdForState, stepEvents);

    return {
      id: txIdForState,
      type: "bridge",
      status: ok ? "success" : "error",
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      feeUsd: estimateBridgeDemo(
        params.amount,
        params.fromChain,
        params.toChain,
      ).feeUsd,
      steps:
        steps.length > 0
          ? steps
          : [{ name: "Cross-chain transfer", state: "success" }],
      txHash: lastHash,
      explorerUrl: lastHash
        ? explorerTxUrl(lastHash)
        : CHAINS[params.toChain].explorer,
      createdAt: new Date().toISOString(),
      message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}`,
      executionMode: "live",
      bridgeResult: result,
      bridgeState: finalState,
    };
  } catch (e) {
    const msg = formatKitError(e);
    console.error("[AGFusion] live App Kit bridge failed:", e);

    // Preserve whatever we learned about this attempt so recovery can resume
    // from the last confirmed state (Phase 6/7). Even when kit.bridge() threw
    // without returning a result, the step events captured by the listener let
    // us reconstruct the state machine.
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
    if (/kit.?key|invalid.?key|unauthorized|401|403|credential/i.test(msg)) {
      throw new Error(
        `Circle rejected the kit key during bridge.\n${msg}\n\n${KIT_KEY_HELP}`,
      );
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
    if (
      /Network connection failed|CONNECTION_FAILED|3001|could not coalesce|fetch failed|Failed to fetch|HTTP request failed/i.test(
        msg,
      )
    ) {
      const src = params.fromChain.replace(/_/g, " ");
      const dst = params.toChain.replace(/_/g, " ");
      // Determine the proxy key for the source chain so users can verify the right endpoint
      const srcKey = chainQuery(params.fromChain);
      const dstKey = chainQuery(params.toChain);
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
    );    } finally {
    // Remove the lifecycle listener on every exit path (success or error).
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

    return {
      id: uid("tx"),
      type: "send",
      status: "success",
      amount: params.amount,
      token: params.token,
      fromChain: params.chain,
      toChain: params.chain,
      recipient: params.recipient,
      recipientLabel: params.recipientLabel,
      feeUsd: 0.04,
      steps: [
        { name: "Send", state: "success", txHash: result.txHash },
      ],
      txHash: result.txHash,
      explorerUrl:
        result.explorerUrl ||
        (result.txHash
          ? explorerTxUrl(result.txHash)
          : CHAINS[params.chain].explorer),
      createdAt: new Date().toISOString(),
      message: "Live send on Arc",
      executionMode: "live",
    };
  } catch (e) {
    console.warn("[AGFusion] live App Kit send failed:", e);
    return null;
  }
}

export async function runBridgeFlow(params: {
  amount: string;
  token: string;
  fromChain: ChainId;
  toChain: ChainId;
  preferLive?: boolean;
  onStep?: (steps: TxStep[]) => void;
  /** Optional: reuse an existing tx id (e.g. the UI placeholder) */
  txId?: string;
  /** Mint recipient (defaults to the connected wallet address) */
  recipient?: string;
}): Promise<TransactionRecord> {
  params.onStep?.([
    { name: "Connect & switch network", state: "active" },
    { name: "Approve / burn", state: "pending" },
    { name: "Mint on destination", state: "pending" },
  ]);

  // Always live — demo bridge disabled
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

/**
 * Verify an existing burn receipt on the source chain. Returns the receipt
 * status when the tx is found and confirmed, null when it cannot be verified.
 * Phase 6/9 — authoritative on-chain check, never "success by UI state".
 */
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
    if (!receipt) return null; // not mined (or not found) yet
    return { status: receipt.status === "0x1" ? "success" : "reverted" };
  } catch {
    return null;
  }
}

/**
 * Phase 6/7 — SAFE bridge recovery. NEVER restarts approve + burn blindly.
 *
 * Recovery resumes from the last confirmed state:
 * 1. If a bridgeResult exists (SDK returned error or threw with partial data),
 *    call kit.retryBridge(result) — the SDK analyzes steps and only executes
 *    the continuation step (approve/burn already succeeded are skipped).
 * 2. If the persisted state proves the burn happened (burnTxHash), verify the
 *    receipt on-chain. Confirmed ⇒ BURN_CONFIRMED and continue to attestation
 *    only — no new burn.
 * 3. Only when there is strong evidence the burn did NOT happen (no hash, no
 *    confirmed state) do we re-run the bridge flow from the start.
 */
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
  const fromChain = params.fromChain;
  const toChain = params.toChain;
  const amount = params.amount;
  const txId = params.txId ?? params.failedTx?.id ?? uid("tx");

  // Recover the persisted state machine (survives reload — Phase 5).
  const persisted = loadBridgeState(txId) ?? (params.failedTx as any)?.bridgeState;
  const previousResult = (params.failedTx as any)?.bridgeResult as unknown;

  // 1) SDK result available → use the SDK's own resume path (Phase 7).
  if (previousResult) {
    try {
      const kit = await getAppKit();
      const {
        createAppKitAdapterFromBrowser: createAdapter,
        EVM_CHAIN_PARAMS,
      } = await import("@/sdk/wallet-adapter");
      const fromChainId = EVM_CHAIN_PARAMS[fromChain]?.chainId;
      const toChainId = EVM_CHAIN_PARAMS[toChain]?.chainId;
      const src = await createAdapter({ requireArc: false, targetChainId: fromChainId });
      const dst = toChainId
        ? await createAdapter({ requireArc: false, targetChainId: toChainId })
        : null;
      if (!kit || !src) {
        throw new Error("App Kit unavailable for bridge recovery.");
      }
      const retried = (await (kit as any).retryBridge(previousResult, {
        from: src.adapter,
        to: (dst?.adapter ?? src.adapter) as any,
      })) as {
        state?: string;
        steps?: Array<{ name?: string; state?: string; txHash?: string; errorMessage?: string }>;
      };

      const steps: TxStep[] = (retried.steps || []).map((s) => ({
        name: s.name || "Step",
        state: s.state === "error" ? "error" : "success",
        txHash: s.txHash,
        message: s.errorMessage,
      }));
      const ok = retried.state !== "error";
      const lastHash = [...steps].reverse().find((s) => s.txHash)?.txHash;
      const finalState = deriveBridgeState(
        txId,
        (retried.steps || []) as Array<{ name?: string; state?: string; txHash?: string }>,
      );
      return {
        id: txId,
        type: "bridge",
        status: ok ? "success" : "error",
        amount,
        token: params.token || "USDC",
        fromChain,
        toChain,
        recipient: params.recipient,
        feeUsd: estimateBridgeDemo(amount, fromChain, toChain).feeUsd,
        steps,
        txHash: lastHash,
        explorerUrl: lastHash ? explorerTxUrl(lastHash) : CHAINS[toChain].explorer,
        createdAt: new Date().toISOString(),
        message: `Recovered bridge ${amount} USDC ${fromChain} → ${toChain}`,
        executionMode: "live",
        bridgeResult: retried,
        bridgeState: finalState,
      };
    } catch (retryErr) {
      console.error("[AGFusion] retryBridge failed, falling back to state resume:", retryErr);
      // Fall through to state-based resume below.
    }
  }

  // 2) Burn already confirmed (hash persisted) → verify receipt, never re-burn.
  if (persisted && isBurnConfirmed(persisted)) {
    const burnHash = persisted.burnTxHash;
    if (burnHash) {
      const receipt = await verifyBurnReceipt(fromChain, burnHash);
      if (receipt?.status === "success") {
        // Burn confirmed on-chain. Resume from attestation using the SDK's own
        // retry path with a reconstructed result — NEVER call kit.bridge again.
        const resumed = await resumeFromBurn(txId, fromChain, toChain, amount, params.token || "USDC", burnHash, params.recipient);
        return resumed;
      }
      if (receipt?.status === "reverted") {
        // Burn reverted — safe to re-run the whole bridge.
        return tryLiveAppKitBridge({
          amount,
          fromChain,
          toChain,
          bridgeState: {
            ...persisted,
            state: "INIT",
            burnTxHash: undefined,
            approvalTxHash: undefined,
          },
        });
      }
      // Receipt not found yet (RPC lag) — do NOT burn again; surface as retryable.
      throw new Error(
        `Burn transaction ${burnHash.slice(0, 18)}… is not confirmed yet. ` +
          "Wait a moment and retry — AGFusion will not burn again.",
      );
    }
    // State says the burn happened but no hash persisted — surface, don't re-burn.
    throw new Error(
      "A previous bridge attempt confirmed a burn but its hash was not persisted. " +
        "Funds are safe on the destination once attestation completes; check the Circle activity or the source explorer before retrying.",
    );
  }

  // 3) No evidence of a burn → safe to run the bridge flow fresh (or resume
  //    with the persisted state if one exists).
  return tryLiveAppKitBridge({
    amount,
    fromChain,
    toChain,
    bridgeState: persisted,
  });
}

/**
 * Resume a bridge whose burn is confirmed: reconstruct an SDK-shaped result
 * (step history + chain defs) and hand it to kit.retryBridge so it continues
 * at fetchAttestation → mint. Guarantees the burn is not re-executed.
 */
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
  const { createAppKitAdapterFromBrowser: createAdapter, EVM_CHAIN_PARAMS } = await import("@/sdk/wallet-adapter");
  if (!kit) throw new Error("App Kit unavailable for bridge recovery.");

  const supported = (kit as any).getSupportedChains?.() as Array<{ chain: string }> | undefined;
  const chains = Array.isArray(supported) ? supported : [];
  const srcDef = chains.find((c) => c.chain === fromChain);
  const dstDef = chains.find((c) => c.chain === toChain);
  if (!srcDef || !dstDef) {
    throw new Error("Circle App Kit could not resolve the bridge chains for recovery.");
  }

  const fromChainId = EVM_CHAIN_PARAMS[fromChain]?.chainId;
  const toChainId = EVM_CHAIN_PARAMS[toChain]?.chainId;
  const src = await createAdapter({ requireArc: false, targetChainId: fromChainId });
  const dst = toChainId ? await createAdapter({ requireArc: false, targetChainId: toChainId }) : null;
  if (!src) throw new Error("Could not reconnect the wallet for bridge recovery.");

  // Step history: only the confirmed burn is present, so the SDK continues at
  // fetchAttestation and never touches approve/burn again.
  const reconstructed = {
    state: "error",
    amount,
    token,
    source: { address: src.address, chain: srcDef },
    destination: { address: (dst?.address ?? src.address), chain: dstDef, recipientAddress: recipient },
    steps: [{ name: "burn", state: "success", txHash: burnHash }],
    config: {},
  };

  const retried = (await (kit as any).retryBridge(reconstructed, {
    from: src.adapter,
    to: (dst?.adapter ?? src.adapter) as any,
  })) as {
    state?: string;
    steps?: Array<{ name?: string; state?: string; txHash?: string; errorMessage?: string }>;
  };

  const steps: TxStep[] = (retried.steps || []).map((s) => ({
    name: s.name || "Step",
    state: s.state === "error" ? "error" : s.state === "success" || s.state === "noop" ? "success" : "active",
    txHash: s.txHash,
    message: s.errorMessage,
  }));
  const ok = retried.state !== "error";
  const lastHash = [...steps].reverse().find((s) => s.txHash)?.txHash;
  const finalState = deriveBridgeState(txId, retried.steps || []);

  return {
    id: txId,
    type: "bridge",
    status: ok ? "success" : "error",
    amount,
    token,
    fromChain,
    toChain,
    recipient,
    feeUsd: estimateBridgeDemo(amount, fromChain, toChain).feeUsd,
    steps,
    txHash: lastHash,
    explorerUrl: lastHash ? explorerTxUrl(lastHash) : CHAINS[toChain].explorer,
    createdAt: new Date().toISOString(),
    message: `Recovered bridge ${amount} USDC ${fromChain} → ${toChain}`,
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
  let kitKey = (await ensureKitKey()) || getPublicKitKey();
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
    if (e instanceof Error && /Circle rejected KIT_KEY|Permanent fix/i.test(e.message)) {
      throw e;
    }
    // Network blip on health — still attempt swap with loaded key
    console.warn("[AGFusion] kit health check skipped", e);
  }

  console.info("[AGFusion] kit key ready", "shape=OK", "len=", kitKey.length);

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
        ? e.message
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

    return {
      id: uid("tx"),
      type: "swap",
      status: "success",
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
      message: result.amountOut
        ? `Received ~${result.amountOut} ${params.tokenOut}`
        : "Live stablecoin FX on Arc",
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
    const viaKit = await tryLiveAppKitSend(params);
    if (viaKit) return viaKit;

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
  let kitKey = await ensureKitKey();
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
        ? e.message
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
  let kitKey = await ensureKitKey();
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
