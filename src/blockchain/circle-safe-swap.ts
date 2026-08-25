import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { explorerTxUrl } from "@/lib/arc-chain";
import { verifyReceiptOnChain } from "@/lib/tx-verify";
import { uid } from "@/lib/utils";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { getInjectedProvider, requestAccounts, switchToChainId } from "@/sdk/wallet-adapter";

const ARC_CHAIN: ChainId = "Arc_Testnet";

type PreparedTx = { to: string; data: string; value?: string };

type PrepareResponse = {
  ok?: boolean;
  transactions?: PreparedTx[];
  estimate?: any;
  error?: string;
};

function asHexValue(value?: string): string {
  if (!value) return "0x0";
  if (/^0x/i.test(value)) return value;
  try { return `0x${BigInt(value).toString(16)}`; } catch { return "0x0"; }
}

function displayAmount(estimate: any, tokenOut: string): string | undefined {
  const candidates = [
    estimate?.estimatedOutput?.amount,
    estimate?.estimatedOutput,
    estimate?.amountOut,
    estimate?.outputAmount,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" || typeof candidate === "number") return `${candidate} ${tokenOut}`;
    if (candidate && typeof candidate === "object" && (typeof candidate.amount === "string" || typeof candidate.amount === "number")) return `${candidate.amount} ${candidate.token || tokenOut}`;
  }
  return undefined;
}

async function executePreparedTransaction(tx: PreparedTx, circle: boolean): Promise<string> {
  if (circle) {
    const { executeCircleContractTransaction } = await import("@/sdk/circle-pw");
    const result = await executeCircleContractTransaction({
      chainId: 5042002,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
    return result.txHash;
  }

  const provider = await getInjectedProvider();
  const accounts = await requestAccounts(provider);
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: accounts[0], to: tx.to, data: tx.data, value: asHexValue(tx.value) }],
  });
  return String(hash);
}

export async function runCircleSafeSwapFlow(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (params.chain !== ARC_CHAIN) throw new Error("Arc Testnet is the only supported swap chain.");
  const tokenIn = params.tokenIn.toUpperCase();
  const tokenOut = params.tokenOut.toUpperCase();
  if (!Number.isFinite(Number(params.amount)) || Number(params.amount) <= 0) throw new Error("Enter a valid swap amount.");
  if (!((tokenIn === "USDC" && tokenOut === "EURC") || (tokenIn === "EURC" && tokenOut === "USDC"))) {
    throw new Error("Arc swap currently supports USDC ↔ EURC.");
  }

  const meta = getActiveWalletMeta();
  const isCircle = meta?.uuid === "circle-pw";
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  await switchToChainId(provider, ARC_CHAIN);
  const accounts = await requestAccounts(provider);
  const owner = String(accounts[0]);

  const steps: TxStep[] = [
    { name: "Get live Circle quote", state: "active" },
    { name: "Approve", state: "pending" },
    { name: "Swap", state: "pending" },
    { name: "Receipt", state: "pending" },
  ];
  params.onStep?.(steps.map((s) => ({ ...s })));

  const response = await fetch("/api/circle/swap/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ address: owner, amount: params.amount, tokenIn, tokenOut, chainId: 5042002 }),
  });
  const prepared = (await response.json().catch(() => ({}))) as PrepareResponse;
  if (!response.ok || !prepared.ok || !Array.isArray(prepared.transactions) || prepared.transactions.length === 0) {
    throw new Error(prepared.error || "Circle could not prepare a live swap quote. Check the server Kit key and Arc liquidity, then retry.");
  }

  const txs = prepared.transactions;
  steps[0].state = "success";
  steps[0].message = displayAmount(prepared.estimate, tokenOut) || "Live Circle route prepared.";
  steps[1].state = txs.length > 1 ? "active" : "success";
  params.onStep?.(steps.map((s) => ({ ...s })));

  let lastHash: string | undefined;
  for (let i = 0; i < txs.length; i += 1) {
    const tx = txs[i];
    const isLikelyApproval = tx.data.slice(0, 10).toLowerCase() === "0x095ea7b3" || i < txs.length - 1;
    const hash = await executePreparedTransaction(tx, isCircle);
    lastHash = hash;
    const verification = await verifyReceiptOnChain({ chainKey: "arc", txHash: hash, attempts: 20, delayMs: 500 });
    if (verification.status === "reverted") {
      const failedIndex = isLikelyApproval ? 1 : 2;
      steps[failedIndex].state = "error";
      steps[failedIndex].txHash = hash;
      steps[failedIndex].message = "Transaction reverted on Arc Testnet.";
      params.onStep?.(steps.map((s) => ({ ...s })));
      return {
        id: uid("tx"), type: "swap", status: "error", retryable: false,
        amount: params.amount, token: tokenIn, tokenOut,
        fromChain: ARC_CHAIN, toChain: ARC_CHAIN, feeUsd: 0,
        steps, txHash: hash, explorerUrl: explorerTxUrl(hash),
        createdAt: new Date().toISOString(),
        message: "Swap transaction reverted on Arc Testnet.", executionMode: "live",
      };
    }

    if (i === 0 && txs.length > 1) {
      steps[1].state = "success";
      steps[1].txHash = hash;
    } else {
      steps[2].state = "success";
      steps[2].txHash = hash;
    }
    params.onStep?.(steps.map((s) => ({ ...s })));
  }

  if (!lastHash) throw new Error("Circle returned no transaction hash.");
  steps[3].state = "success";
  steps[3].txHash = lastHash;
  params.onStep?.(steps.map((s) => ({ ...s })));

  return {
    id: uid("tx"), type: "swap", status: "success", retryable: false,
    amount: params.amount, token: tokenIn, tokenOut,
    fromChain: ARC_CHAIN, toChain: ARC_CHAIN, feeUsd: 0,
    steps, txHash: lastHash, explorerUrl: explorerTxUrl(lastHash),
    createdAt: new Date().toISOString(),
    message: `Swap confirmed: ${params.amount} ${tokenIn} → ${tokenOut}.`, executionMode: "live",
  };
}
