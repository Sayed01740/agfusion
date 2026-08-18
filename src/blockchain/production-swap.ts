import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getInjectedProvider, requestAccounts, switchToChainId } from "@/sdk/wallet-adapter";
import { explorerTxUrl } from "@/lib/arc-chain";
import { verifyReceiptOnChain } from "@/lib/tx-verify";
import { uid } from "@/lib/utils";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";

const ARC_CHAIN: ChainId = "Arc_Testnet";
const ROUTER = "0x437b1aBf6e5a69548849b15EC35f83A73Fa1E28F" as `0x${string}`;
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df" as `0x${string}`;
const TOKENS = {
  USDC: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`,
  cirBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as `0x${string}`,
} as const;
const DECIMALS = { USDC: 6, EURC: 6, cirBTC: 8 } as const;
const SLIPPAGE_BPS = 100n;

type ArcSwapToken = keyof typeof TOKENS;

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const ROUTER_ABI = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactETHForTokensSupportingFeeOnTransferTokens", stateMutability: "payable", inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [] },
  { type: "function", name: "swapExactTokensForETHSupportingFeeOnTransferTokens", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [] },
  { type: "function", name: "swapExactTokensForTokensSupportingFeeOnTransferTokens", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

function assertToken(token: string): asserts token is ArcSwapToken {
  if (!(token in TOKENS)) throw new Error("Arc Testnet Swap supports USDC, EURC, and cirBTC.");
}

function normalizeAmount(amount: string, token: ArcSwapToken): bigint {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) throw new Error("Enter a valid swap amount.");
  return parseUnits(amount, DECIMALS[token]);
}

async function ethCall(provider: Provider, to: `0x${string}`, data: `0x${string}`): Promise<`0x${string}`> {
  const result = await provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  return String(result) as `0x${string}`;
}

async function blockTimestamp(provider: Provider): Promise<bigint> {
  const hex = String(await provider.request({ method: "eth_getBlockByNumber", params: ["latest", false] }) as any);
  try {
    const block = JSON.parse(hex) as { timestamp?: string };
    return BigInt(block.timestamp || "0x0");
  } catch {
    return BigInt(Math.floor(Date.now() / 1000));
  }
}

function effectiveAddress(token: ArcSwapToken): `0x${string}` {
  return token === "USDC" ? WUSDC : TOKENS[token];
}

async function quotePath(provider: Provider, amountIn: bigint, path: `0x${string}`[]): Promise<bigint> {
  const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] });
  const raw = await ethCall(provider, ROUTER, data);
  const encoded = raw.slice(2);
  if (!encoded) throw new Error("No liquidity route available on Arc Testnet.");
  const offset = BigInt(`0x${encoded.slice(0, 64)}`);
  const start = Number(offset) * 2;
  const length = Number(BigInt(`0x${encoded.slice(start, start + 64)}`));
  if (!length) throw new Error("No liquidity route available on Arc Testnet.");
  const last = encoded.slice(start + 64 + (length - 1) * 64, start + 64 + length * 64);
  return BigInt(`0x${last}`);
}

export async function getArcDexSwapQuote(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
}): Promise<{ amountOut: string; route: string; slippageBps: number }> {
  const tokenIn = params.tokenIn as ArcSwapToken;
  const tokenOut = params.tokenOut as ArcSwapToken;
  assertToken(tokenIn);
  assertToken(tokenOut);
  if (tokenIn === tokenOut) throw new Error("Choose two different tokens.");
  const provider = await getInjectedProvider();
  await requestAccounts(provider);
  await switchToChainId(provider, ARC_CHAIN);
  const amountIn = normalizeAmount(params.amount, tokenIn);
  const a = effectiveAddress(tokenIn);
  const b = effectiveAddress(tokenOut);
  const candidates: { path: `0x${string}`[]; out: bigint }[] = [];
  for (const path of [a === b ? [] : [a, b], a !== WUSDC && b !== WUSDC ? [a, WUSDC, b] : []]) {
    if (!path.length) continue;
    try {
      candidates.push({ path, out: await quotePath(provider, amountIn, path) });
    } catch {}
  }
  if (!candidates.length) throw new Error(`No liquidity route available for ${tokenIn} → ${tokenOut} on Arc Testnet.`);
  candidates.sort((x, y) => (x.out > y.out ? -1 : x.out < y.out ? 1 : 0));
  const best = candidates[0];
  return {
    amountOut: formatUnits(best.out, DECIMALS[tokenOut]),
    route: best.path.length === 2 ? "APEXISWAP direct" : "APEXISWAP via WUSDC",
    slippageBps: Number(SLIPPAGE_BPS),
  };
}

async function approveIfNeeded(provider: Provider, owner: `0x${string}`, token: ArcSwapToken, amount: bigint): Promise<string | undefined> {
  if (token === "USDC") return undefined;
  const allowanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [owner, ROUTER] });
  const allowanceRaw = await ethCall(provider, TOKENS[token], allowanceData);
  const allowance = BigInt(`0x${allowanceRaw.slice(2)}`);
  if (allowance >= amount) return undefined;
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [ROUTER, amount] });
  const tx = String(await provider.request({ method: "eth_sendTransaction", params: [{ from: owner, to: TOKENS[token], data }] }));
  const receipt = await verifyReceiptOnChain({ chainKey: "arc", txHash: tx, attempts: 8, delayMs: 750 });
  if (receipt.status !== "success") throw new Error("Token approval was not confirmed on-chain.");
  return tx;
}

export async function runProductionSwap(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (params.chain !== ARC_CHAIN) throw new Error("Arc Testnet is the only supported swap testnet.");
  const tokenIn = params.tokenIn as ArcSwapToken;
  const tokenOut = params.tokenOut as ArcSwapToken;
  assertToken(tokenIn);
  assertToken(tokenOut);
  if (tokenIn === tokenOut) throw new Error("Choose two different tokens.");

  const provider = await getInjectedProvider();
  const accounts = await requestAccounts(provider);
  await switchToChainId(provider, ARC_CHAIN);
  const owner = String(accounts[0]).toLowerCase() as `0x${string}`;
  const amountIn = normalizeAmount(params.amount, tokenIn);

  const quote = await getArcDexSwapQuote(params);
  const quotedOut = parseUnits(quote.amountOut, DECIMALS[tokenOut]);
  const minOut = (quotedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const now = await blockTimestamp(provider);
  const deadline = now + 120n;
  const steps: TxStep[] = [
    { name: "Live quote", state: "success", message: `${quote.route} · ${quote.slippageBps / 100}% slippage` },
    { name: "Approve", state: tokenIn === "USDC" ? "success" : "active" },
    { name: "Swap", state: "pending" },
    { name: "Receipt", state: "pending" },
  ];
  params.onStep?.(steps.map((s) => ({ ...s })));

  let approvalTx: string | undefined;
  if (tokenIn !== "USDC") {
    approvalTx = await approveIfNeeded(provider, owner, tokenIn, amountIn);
    steps[1].state = "success";
    steps[1].txHash = approvalTx;
    params.onStep?.(steps.map((s) => ({ ...s })));
  }

  const inPath = effectiveAddress(tokenIn);
  const outPath = effectiveAddress(tokenOut);
  const path = inPath === WUSDC || outPath === WUSDC ? [inPath, outPath] : [inPath, outPath];
  const finalPath = path.length === 2 ? path : [inPath, WUSDC, outPath];
  let data: `0x${string}`;
  let value = "0x0";

  if (tokenIn === "USDC") {
    data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens", args: [minOut, finalPath, owner, deadline] });
    value = `0x${parseUnits(params.amount, 18).toString(16)}`;
  } else if (tokenOut === "USDC") {
    data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens", args: [amountIn, minOut, finalPath, owner, deadline] });
  } else {
    data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens", args: [amountIn, minOut, finalPath, owner, deadline] });
  }

  let txHash: string;
  try {
    txHash = String(await provider.request({ method: "eth_sendTransaction", params: [{ from: owner, to: ROUTER, data, value }] }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/4001|reject|denied|cancel/i.test(message)) throw new Error("Swap cancelled in wallet.");
    throw new Error(message || "Arc swap transaction failed.");
  }

  steps[2].state = "success";
  steps[2].txHash = txHash;
  steps[3].state = "active";
  steps[3].txHash = txHash;
  params.onStep?.(steps.map((s) => ({ ...s })));

  const verification = await verifyReceiptOnChain({ chainKey: "arc", txHash, attempts: 8, delayMs: 1_000 });
  if (verification.status === "reverted") {
    steps[3].state = "error";
    steps[3].message = "Swap transaction reverted on-chain.";
    params.onStep?.(steps.map((s) => ({ ...s })));
    return {
      id: uid("tx"), type: "swap", status: "error", retryable: false,
      amount: params.amount, token: tokenIn, tokenOut, fromChain: ARC_CHAIN, toChain: ARC_CHAIN,
      feeUsd: 0, steps, txHash, explorerUrl: explorerTxUrl(txHash), createdAt: new Date().toISOString(),
      message: "Swap reverted on-chain. No retry was submitted automatically.", executionMode: "live",
    };
  }
  if (verification.status !== "success") {
    steps[3].state = "pending";
    steps[3].message = "Receipt not confirmed yet.";
    params.onStep?.(steps.map((s) => ({ ...s })));
    return {
      id: uid("tx"), type: "swap", status: "retryable", retryable: true,
      amount: params.amount, token: tokenIn, tokenOut, fromChain: ARC_CHAIN, toChain: ARC_CHAIN,
      feeUsd: 0, steps, txHash, explorerUrl: explorerTxUrl(txHash), createdAt: new Date().toISOString(),
      message: "Swap submitted but the receipt is not confirmed yet.", executionMode: "live",
    };
  }

  steps[3].state = "success";
  params.onStep?.(steps.map((s) => ({ ...s })));
  return {
    id: uid("tx"), type: "swap", status: "success", retryable: false,
    amount: params.amount, token: tokenIn, tokenOut, fromChain: ARC_CHAIN, toChain: ARC_CHAIN,
    feeUsd: 0, steps, txHash, explorerUrl: explorerTxUrl(txHash), createdAt: new Date().toISOString(),
    message: `Swap confirmed: ${params.amount} ${tokenIn} → approximately ${quote.amountOut} ${tokenOut}. Receipt verified on-chain.`,
    executionMode: "live",
  };
}
