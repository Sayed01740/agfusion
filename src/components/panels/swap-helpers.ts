import { normalizeSlippageBps } from "@/blockchain/production-swap";
import { assertArcMainnetWalletState } from "@/blockchain/uniswap-mainnet-adapter";
import { getChainId, getInjectedProvider } from "@/sdk/wallet-adapter";

export const ERC20_APPROVE_ABI = [
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

export type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
export const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];
export const SLIPPAGE_PRESETS = ["0.5", "1", "1.5", "2", "3"];

export type SwapQuote = {
  amountOut?: string;
  minimumAmountOut?: string;
  route?: string;
  network?: "mainnet" | "testnet";
  quoteSession?: string;
  quoteSessionExpiresAt?: number;
  permitData?: Record<string, unknown> | null;
  estimatedGasUsd?: string | null;
};

export type PreparedMainnetTransaction = {
  executionEnabled: boolean;
  receiptVerificationTicket?: string;
  transaction: {
    chainId: number;
    from: string;
    to: string;
    data: string;
    value: string;
    gasLimit: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };
  validation?: {
    estimatedGas?: string;
    estimatedGasCost?: string;
    minimumAmountOut?: string;
    commandNames?: string[];
  };
};

export type PendingApprovalTransaction = {
  chainId: number;
  from: string;
  to: string;
  data: string;
  value: string;
  spender: string;
  amount: string;
};

export type SwapFlowStep = "idle" | "approving" | "signing" | "preparing" | "broadcasting";

export function prettyAmount(value?: string): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export function parseSlippageBps(value: string): number {
  return normalizeSlippageBps(Number(value) * 100);
}

export function minimumReceived(amountOut: string, slippage: string): string {
  const out = Number(amountOut);
  const pct = Number(slippage);
  if (!Number.isFinite(out) || !Number.isFinite(pct)) return "—";
  return (out * (1 - pct / 100)).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function getVerifiedMainnetProvider(expectedAddress: string) {
  const provider = await getInjectedProvider();
  const [chainId, rawAccounts] = await Promise.all([
    getChainId(provider),
    provider.request({ method: "eth_accounts" }),
  ]);
  const account = Array.isArray(rawAccounts) && typeof rawAccounts[0] === "string"
    ? rawAccounts[0]
    : null;
  assertArcMainnetWalletState({ chainId, account, expectedAccount: expectedAddress });
  return { provider, account: account as string };
}
