import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, getInjectedProvider, requestAccounts, switchToChainId } from "@/sdk/wallet-adapter";
import { explorerTxUrl } from "@/lib/arc-chain";
import { verifyReceiptOnChain } from "@/lib/tx-verify";
import { getCctpConfig } from "@/lib/cctp-chains";
import { installCircleApiProxy } from "@/lib/circle-proxy";
import { uid } from "@/lib/utils";

const ARC_SWAP_TOKENS = new Set(["USDC", "EURC", "cirBTC"]);

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const value = error as Record<string, unknown>;
    return String(value?.message || value?.shortMessage || value?.details || error);
  } catch {
    return String(error);
  }
}

function assertSwapInput(amount: string, tokenIn: string, tokenOut: string, chain: ChainId) {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) throw new Error("Enter a valid swap amount.");
  if (chain !== "Arc_Testnet") throw new Error("Arc Testnet is the only supported swap testnet.");
  if (!ARC_SWAP_TOKENS.has(tokenIn) || !ARC_SWAP_TOKENS.has(tokenOut)) {
    throw new Error("Arc Testnet Swap supports USDC, EURC, and cirBTC.");
  }
  if (tokenIn === tokenOut) throw new Error("Choose two different tokens.");
}

export async function runProductionSwap(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") throw new Error("Swap requires a connected browser wallet.");
  assertSwapInput(params.amount, params.tokenIn.toUpperCase(), params.tokenOut.toUpperCase(), params.chain);

  installCircleApiProxy();

  const kit = await getAppKit();
  if (!kit) throw new Error("Circle App Kit could not be loaded. Refresh and retry.");

  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  await switchToChainId(provider, params.chain);

  // Keep the adapter bound to the connected user wallet and let the wallet
  // adapter handle the Arc chain. Do not use the old targetChainId proxy mode.
  const wired = await createAppKitAdapterFromBrowser({ requireArc: true });
  if (!wired) throw new Error("Wallet adapter unavailable. Reconnect your wallet and retry.");

  const tokenIn = params.tokenIn.toUpperCase();
  const tokenOut = params.tokenOut.toUpperCase();

  // Never send kitKey from browser JavaScript. Circle's server proxy injects
  // the server-only KIT_KEY when forwarding Stablecoin Kit API requests.
  const swapParams = {
    from: { adapter: wired.adapter, chain: params.chain },
    tokenIn,
    tokenOut,
    amountIn: String(params.amount),
    config: {},
  };

  const steps: TxStep[] = [
    { name: "Live quote", state: "active" },
    { name: "Approve", state: "pending" },
    { name: "Swap", state: "pending" },
    { name: "Receipt", state: "pending" },
  ];
  params.onStep?.(steps.map((step) => ({ ...step })));

  let result: {
    txHash?: string;
    amountOut?: string;
    explorerUrl?: string;
    state?: string;
    error?: string;
  };

  try {
    // Keyless browser App Kit path. The proxied Circle API request is
    // authenticated server-side by /api/circle/proxy.
    if (typeof kit.estimateSwap === "function") {
      await kit.estimateSwap(swapParams);
    }

    steps[0].state = "success";
    steps[1].state = "active";
    params.onStep?.(steps.map((step) => ({ ...step })));

    result = (await kit.swap(swapParams)) as typeof result;
  } catch (error) {
    const message = formatError(error);
    if (/4001|user rejected|denied|cancelled/i.test(message)) {
      throw new Error("Swap cancelled in wallet.");
    }
    throw new Error(message || "Circle Swap failed.");
  }

  if (result?.state === "error") {
    throw new Error(result.error || "Circle Swap returned an error state.");
  }
  if (!result?.txHash) {
    return {
      id: uid("tx"),
      type: "swap",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: tokenIn,
      tokenOut,
      fromChain: params.chain,
      toChain: params.chain,
      feeUsd: 0,
      steps: [
        ...steps.slice(0, 2).map((step) => ({ ...step, state: step.name === "Approve" ? "success" as const : step.state })),
        { name: "Swap", state: "pending", message: "Circle submitted the swap without a transaction hash. No success is reported." },
      ],
      createdAt: new Date().toISOString(),
      message: "Swap submitted without a transaction hash. Retry only after checking wallet activity.",
      executionMode: "live",
    };
  }

  steps[1].state = "success";
  steps[2].state = "success";
  steps[2].txHash = result.txHash;
  steps[3].state = "active";
  steps[3].txHash = result.txHash;
  params.onStep?.(steps.map((step) => ({ ...step })));

  const chainKey = getCctpConfig(params.chain)?.rpcProxyKey || "arc";
  let verification: Awaited<ReturnType<typeof verifyReceiptOnChain>>;
  try {
    verification = await verifyReceiptOnChain({
      chainKey,
      txHash: result.txHash,
      attempts: 4,
      delayMs: 1_250,
    });
  } catch {
    steps[3].state = "pending";
    steps[3].message = "Receipt verification is temporarily unavailable. No success is reported.";
    params.onStep?.(steps.map((step) => ({ ...step })));
    return {
      id: uid("tx"),
      type: "swap",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: tokenIn,
      tokenOut,
      fromChain: params.chain,
      toChain: params.chain,
      feeUsd: 0,
      steps,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl || explorerTxUrl(result.txHash),
      createdAt: new Date().toISOString(),
      message: "Swap submitted, but its on-chain receipt could not be verified yet.",
      executionMode: "live",
    };
  }

  if (verification.status === "reverted") {
    steps[3].state = "error";
    steps[3].message = "Swap transaction reverted on-chain.";
    params.onStep?.(steps.map((step) => ({ ...step })));
    return {
      id: uid("tx"),
      type: "swap",
      status: "error",
      retryable: false,
      amount: params.amount,
      token: tokenIn,
      tokenOut,
      fromChain: params.chain,
      toChain: params.chain,
      feeUsd: 0,
      steps,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl || explorerTxUrl(result.txHash),
      createdAt: new Date().toISOString(),
      message: "Swap reverted on-chain. No retry was submitted automatically.",
      executionMode: "live",
    };
  }

  if (verification.status === "not_found") {
    steps[3].state = "pending";
    steps[3].message = "Receipt not confirmed yet.";
    params.onStep?.(steps.map((step) => ({ ...step })));
    return {
      id: uid("tx"),
      type: "swap",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: tokenIn,
      tokenOut,
      fromChain: params.chain,
      toChain: params.chain,
      feeUsd: 0,
      steps,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl || explorerTxUrl(result.txHash),
      createdAt: new Date().toISOString(),
      message: "Swap submitted but the receipt is not confirmed yet.",
      executionMode: "live",
    };
  }

  steps[3].state = "success";
  params.onStep?.(steps.map((step) => ({ ...step })));

  return {
    id: uid("tx"),
    type: "swap",
    status: "success",
    retryable: false,
    amount: params.amount,
    token: tokenIn,
    tokenOut,
    fromChain: params.chain,
    toChain: params.chain,
    feeUsd: 0,
    steps,
    txHash: result.txHash,
    explorerUrl: result.explorerUrl || explorerTxUrl(result.txHash),
    createdAt: new Date().toISOString(),
    message: result.amountOut
      ? `Swap confirmed: ${params.amount} ${tokenIn} → ${result.amountOut} ${tokenOut}. Receipt verified on-chain.`
      : `Swap ${params.amount} ${tokenIn} → ${tokenOut} confirmed. Receipt verified on-chain.`,
    executionMode: "live",
  };
}
