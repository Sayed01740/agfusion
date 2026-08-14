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

  // Critical: do NOT force Arc first — source may be Base/ETH Sepolia
  const { switchToChainId, getInjectedProvider, requestAccounts } =
    await import("@/sdk/wallet-adapter");
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  try {
    await switchToChainId(provider, params.fromChain);
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? e.message
        : `Switch Rabby to ${params.fromChain} (source network) before bridging.`,
    );
  }

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) {
    throw new Error(
      "Wallet not ready. Connect Rabby, then Confirm bridge again.",
    );
  }

  // Ensure adapter provider is on source chain again after build
  try {
    await switchToChainId(wired.provider, params.fromChain);
  } catch {
    /* kit may switch itself */
  }

  // Hard preflight: source + dest public RPCs must answer eth_chainId
  const chainQuery = (c: string) =>
    c === "Arc_Testnet"
      ? "arc"
      : c === "Base_Sepolia"
        ? "base"
        : c === "Ethereum_Sepolia"
          ? "eth"
          : c === "Arbitrum_Sepolia"
            ? "arb"
            : c === "Optimism_Sepolia"
              ? "op"
              : c === "Polygon_Amoy_Testnet" || c === "Polygon_Amoy"
                ? "polygon"
                : c === "Avalanche_Fuji"
                  ? "avax"
                  : "arc";

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

  try {
    const bridgeParams: Record<string, unknown> = {
      from: {
        adapter: wired.adapter,
        chain: params.fromChain,
      },
      to: {
        adapter: wired.adapter,
        chain: params.toChain,
      },
      amount: String(params.amount),
      token: "USDC",
      config: { kitKey },
    };

    const { EVM_CHAIN_PARAMS } = await import("@/sdk/wallet-adapter");
    if (typeof window !== "undefined") {
      (window as any).__agfusion_expected_chain = EVM_CHAIN_PARAMS[params.fromChain]?.chainId;
    }

    kit.on("*", (payload: any) => {
      console.log("[AGFusion Bridge Lifecycle] Action:", payload);
      if (typeof window !== "undefined" && payload?.state === "active") {
        const name = (payload?.name || "").toLowerCase();
        if (name.includes("receive") || name.includes("mint") || name.includes("destination")) {
          (window as any).__agfusion_expected_chain = EVM_CHAIN_PARAMS[params.toChain]?.chainId;
        }
      }
    });

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

    if (result.state === "error") {
      console.warn("[AGFusion] Bridge returned error state, attempting recovery via retryBridge...");
      try {
        result = (await (kit as any).retryBridge(result, {
          from: wired.adapter,
          to: wired.adapter,
        })) as typeof result;
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
      throw new Error(
        errStep?.message ||
          "Bridge returned error. Check USDC on the source chain and try again.",
      );
    }

    return {
      id: uid("tx"),
      type: "bridge",
      status: "success",
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
    };
  } catch (e) {
    const msg = formatKitError(e);
    console.error("[AGFusion] live App Kit bridge failed:", e);

    if (/4001|user rejected|denied|rejected by user/i.test(msg)) {
      throw new Error("Bridge cancelled in wallet.");
    }
    if (/kit.?key|invalid.?key|unauthorized|401|403|credential/i.test(msg)) {
      throw new Error(
        `Circle rejected the kit key during bridge.\n${msg}\n\n${KIT_KEY_HELP}`,
      );
    }
    if (/insufficient|balance/i.test(msg)) {
      throw new Error(
        `Insufficient USDC on ${params.fromChain}. Bridge pulls funds from the **source** chain.`,
      );
    }
    if (
      /Network connection failed|CONNECTION_FAILED|3001|could not coalesce|fetch failed|Failed to fetch|HTTP request failed/i.test(
        msg,
      )
    ) {
      const src = params.fromChain.replace(/_/g, " ");
      // Circle maps almost any error containing "network" → CONNECTION_FAILED.
      // Surface the dug raw detail so we can see the real cause.
      throw new Error(
        [
          `Could not complete Bridge **${src} → ${params.toChain.replace(/_/g, " ")}**.`,
          "",
          "AGFusion proxies Arc/Base RPC server-side. Usually this is still a wallet/RPC issue:",
          "1. Hard-refresh (Ctrl+Shift+R) so the latest proxy code loads",
          `2. Rabby must stay on **${src}** while approving the burn (chain id 5042002 for Arc)`,
          "3. Arc RPC in Rabby: https://rpc.testnet.arc.io · currency USDC",
          "4. You need **USDC on the source chain** (Arc for Arc→Base)",
          "5. Check /api/rpc?chain=arc returns ok:true",
          "",
          `Detail: ${msg}`,
        ].join("\n"),
      );
    }
    throw new Error(
      msg ||
        `Bridge failed. Connect Rabby · switch to **${params.fromChain}** · have USDC there · confirm again.`,
    );
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
}): Promise<TransactionRecord> {
  const { runNativeCctpBridge } = await import("@/blockchain/cctp-service");
  return runNativeCctpBridge({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    onStep: params.onStep,
  });
}

export async function runBridgeWithRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
}): Promise<TransactionRecord> {
  return tryLiveAppKitBridge(params);
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
