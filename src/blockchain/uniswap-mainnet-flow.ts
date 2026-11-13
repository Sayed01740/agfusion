/**
 * Headless Arc Mainnet swap (Uniswap + Permit2) used by the AI Agent.
 *
 * Mirrors the guided flow in ProductionSwapPanel but without any UI state:
 *   quote → (ERC-20 approve to Permit2 if needed) → refresh quote →
 *   Permit2 EIP-712 signature → server-side calldata validation →
 *   wallet broadcast → on-chain receipt + server receipt verification.
 *
 * Every step that moves value is an explicit wallet prompt; nothing is signed
 * or sent without the user approving it in their wallet.
 */

import { encodeFunctionData, maxUint256, parseUnits, type Address } from "viem";
import type { TransactionRecord } from "@/types";
import { normalizeSlippageBps } from "@/blockchain/production-swap";
import { ARC_PERMIT2_CONTRACT } from "@/blockchain/uniswap-permit2";
import { assertArcMainnetWalletState } from "@/blockchain/uniswap-mainnet-adapter";
import { explorerTxUrl } from "@/lib/arc-chain";
import { arcPublicClient, readAllowance } from "@/lib/dapp/erc20";
import { getToken } from "@/lib/dapp/tokens";
import { getChainId, getInjectedProvider } from "@/sdk/wallet-adapter";
import { uid } from "@/lib/utils";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type SwapToken = "USDC" | "EURC" | "cirBTC";

export type MainnetSwapParams = {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  walletAddress: string;
  /** Slippage in percent (e.g. 1 = 1%). Defaults to 1%. */
  slippagePercent?: number;
  approvalMode?: "exact" | "unlimited";
  onStatus?: (message: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalToken(symbol: string): SwapToken {
  const s = symbol.trim().toUpperCase();
  if (s === "USDC") return "USDC";
  if (s === "EURC") return "EURC";
  if (s === "CIRBTC") return "cirBTC";
  throw new Error(`Arc Mainnet swap supports USDC, EURC, and cirBTC (received "${symbol}").`);
}

type QuotePayload = {
  quoteSession: string;
  amountOut: string;
  estimatedGasUsd: string | null;
  permitData: Record<string, unknown> | null;
};

async function fetchQuote(
  account: string,
  amount: string,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  slippageBps: number,
): Promise<QuotePayload> {
  const response = await fetch("/api/uniswap/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account, amount, tokenIn, tokenOut, chainId: 5042, slippageBps }),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(data) || data.ok !== true || typeof data.quoteSession !== "string") {
    const message = isRecord(data) && typeof data.detail === "string"
      ? data.detail
      : isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Unable to obtain an Arc Mainnet quote.";
    throw new Error(message);
  }
  return {
    quoteSession: data.quoteSession,
    amountOut: String(data.amountOut || ""),
    estimatedGasUsd: typeof data.estimatedGasUsd === "string" ? data.estimatedGasUsd : null,
    permitData: isRecord(data.permitData) ? data.permitData : null,
  };
}

export async function runMainnetUniswapSwap(params: MainnetSwapParams): Promise<TransactionRecord> {
  const say = params.onStatus ?? (() => {});
  const tokenIn = canonicalToken(params.tokenIn);
  const tokenOut = canonicalToken(params.tokenOut);
  const amount = params.amount.trim();

  if (tokenIn === tokenOut) throw new Error("Choose two different tokens.");
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) throw new Error("Enter a valid swap amount.");
  const slippageBps = normalizeSlippageBps((params.slippagePercent ?? 1) * 100);

  // Server gate: is Mainnet transaction preparation enabled in this deployment?
  const gateResponse = await fetch("/api/uniswap/swap", { method: "GET", cache: "no-store" });
  const gate: unknown = await gateResponse.json().catch(() => null);
  if (!gateResponse.ok || !isRecord(gate) || gate.enabled !== true || typeof gate.executionEnabled !== "boolean") {
    throw new Error("Mainnet swap preparation is disabled in this deployment.");
  }
  if (gate.executionEnabled !== true) {
    throw new Error("Mainnet swap execution is read-only in this deployment (quote only).");
  }

  // Verify the wallet is on Arc Mainnet and is the expected account.
  const provider = await getInjectedProvider();
  const [chainId, rawAccounts] = await Promise.all([
    getChainId(provider),
    provider.request({ method: "eth_accounts" }),
  ]);
  const account = Array.isArray(rawAccounts) && typeof rawAccounts[0] === "string" ? rawAccounts[0] : null;
  assertArcMainnetWalletState({ chainId, account, expectedAccount: params.walletAddress });
  const from = account as string;

  say("Fetching live Uniswap quote on Arc Mainnet…");
  let quote = await fetchQuote(from, amount, tokenIn, tokenOut, slippageBps);

  // Step 1: ERC-20 approval to Permit2 (non-native tokens only, only if allowance is short).
  if (tokenIn !== "USDC") {
    const tokenMeta = getToken(tokenIn, true);
    const requiredUnits = parseUnits(amount, tokenMeta.decimals);
    let needsApproval = false;
    try {
      const current = await readAllowance(tokenMeta.address, from as Address, ARC_PERMIT2_CONTRACT as Address, true);
      needsApproval = current < requiredUnits;
    } catch {
      needsApproval = false;
    }
    if (needsApproval) {
      say(`Step 1/3 · Approve ${tokenIn} for Permit2 in your wallet…`);
      const approveAmount = params.approvalMode === "unlimited" ? maxUint256 : requiredUnits;
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [ARC_PERMIT2_CONTRACT as Address, approveAmount],
      });
      const approveHash = String(
        await provider.request({
          method: "eth_sendTransaction",
          params: [{ from, to: tokenMeta.address, data: approveData, value: "0x0" }],
        }),
      );
      say(`Waiting for ${tokenIn} approval confirmation (${approveHash.slice(0, 10)}…)…`);
      const approveReceipt = await arcPublicClient(true).waitForTransactionReceipt({
        hash: approveHash as `0x${string}`,
        timeout: 90_000,
      });
      if (approveReceipt.status !== "success") throw new Error(`${tokenIn} approval reverted on Arc Mainnet.`);
      say("Approval confirmed ✓ Refreshing live quote…");
      quote = await fetchQuote(from, amount, tokenIn, tokenOut, slippageBps);
    }
  }

  // Step 2: Permit2 EIP-712 signature (gasless) when the quote requires it.
  let signature: string | undefined;
  if (quote.permitData) {
    say("Step 2/3 · Sign the Permit2 authorization in your wallet (gasless)…");
    const permit = quote.permitData;
    if (!isRecord(permit.domain) || !isRecord(permit.types) || !isRecord(permit.values)) {
      throw new Error("The quote returned malformed Permit2 typed data. Request a new quote.");
    }
    const typedData = {
      domain: permit.domain,
      types: permit.types,
      primaryType: "PermitSingle",
      message: permit.values,
    };
    const signed = await provider.request({
      method: "eth_signTypedData_v4",
      params: [from, JSON.stringify(typedData)],
    });
    if (typeof signed !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signed)) {
      throw new Error("The wallet did not return a valid 65-byte Permit2 signature.");
    }
    signature = signed;
  }

  // Step 3: server validates the calldata and returns the unsigned transaction.
  say("Preparing and validating swap transaction…");
  const response = await fetch("/api/uniswap/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteSession: quote.quoteSession, ...(signature ? { signature } : {}) }),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(data)) {
    if (isRecord(data) && isRecord(data.approvalTransaction)) {
      throw new Error("Permit2 ERC-20 approval is required first. Open the Swap tab and approve, then retry.");
    }
    const message = isRecord(data) && typeof data.detail === "string"
      ? data.detail
      : isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Mainnet transaction preparation failed. Request a fresh quote.";
    throw new Error(message);
  }
  if (
    data.ok !== true ||
    data.executionEnabled !== true ||
    !isRecord(data.transaction) ||
    Number(data.chainId) !== 5042 ||
    Number(data.transaction.chainId) !== 5042 ||
    String(data.transaction.from || "").toLowerCase() !== from.toLowerCase()
  ) {
    throw new Error("The server did not return a valid executable Arc Mainnet transaction.");
  }

  const tx = data.transaction;
  const gasLimit = String(tx.gasLimit || "");
  const rawValue = String(tx.value || "0");
  const valueHex = rawValue && rawValue !== "0" && rawValue !== "0x0"
    ? (rawValue.startsWith("0x") ? rawValue : `0x${BigInt(rawValue).toString(16)}`)
    : "0x0";
  const txParams: Record<string, string> = {
    from,
    to: String(tx.to),
    data: String(tx.data || ""),
    value: valueHex,
  };
  if (gasLimit) txParams.gas = `0x${BigInt(gasLimit).toString(16)}`;

  // Step 4: wallet prompt to broadcast the swap.
  say("Step 3/3 · Confirm the swap transaction in your wallet…");
  const txHash = String(await provider.request({ method: "eth_sendTransaction", params: [txParams] }));

  say(`Swap broadcast (${txHash.slice(0, 10)}…). Waiting for Arc Mainnet confirmation…`);
  const receipt = await arcPublicClient(true).waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 90_000,
  });
  if (receipt.status !== "success") throw new Error(`Swap transaction reverted on Arc Mainnet (${txHash}).`);

  const ticket = typeof data.receiptVerificationTicket === "string" ? data.receiptVerificationTicket : undefined;
  if (ticket) {
    const verifyRes = await fetch("/api/uniswap/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptVerificationTicket: ticket, transactionHash: txHash }),
      cache: "no-store",
    });
    const verifyData: unknown = await verifyRes.json().catch(() => null);
    if (!verifyRes.ok || !isRecord(verifyData) || verifyData.ok !== true) {
      throw new Error(
        isRecord(verifyData) && typeof verifyData.detail === "string"
          ? verifyData.detail
          : "Swap confirmed on-chain, but receipt verification failed.",
      );
    }
  }

  return {
    id: uid("tx"),
    type: "swap",
    status: "success",
    amount,
    token: tokenIn,
    tokenOut,
    fromChain: "Arc_Mainnet",
    toChain: "Arc_Mainnet",
    feeUsd: Number(quote.estimatedGasUsd || 0.01),
    txHash,
    explorerUrl: explorerTxUrl(txHash, 5042),
    createdAt: new Date().toISOString(),
    message: `Swapped ${amount} ${tokenIn} → ${quote.amountOut || ""} ${tokenOut} on Arc Mainnet`,
    executionMode: "live",
    steps: [
      { name: "Quote & Permit2", state: "success" },
      { name: "Broadcast Swap", state: "success", txHash },
      { name: "Arc Mainnet Finality", state: "success", txHash },
    ],
  } as TransactionRecord;
}

