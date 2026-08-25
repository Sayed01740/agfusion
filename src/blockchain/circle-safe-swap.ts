import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { runProductionSwap } from "@/blockchain/production-swap";

const ARC_CHAIN: ChainId = "Arc_Testnet";

/**
 * Arc Testnet swap execution deliberately does not use Circle's
 * Stablecoin Service Swap provider. That provider is a managed swap
 * service and its current published package does not support testnet
 * swap execution. Arc Testnet has its own live DEX path in
 * production-swap.ts, which works with the connected EIP-1193 wallet,
 * including the Circle Email/Smart Wallet adapter.
 */
export async function runCircleSafeSwapFlow(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  slippageBps?: number;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (params.chain !== ARC_CHAIN) {
    throw new Error("Arc Testnet is the only supported swap chain.");
  }

  const tokenIn = params.tokenIn.toUpperCase();
  const tokenOut = params.tokenOut.toUpperCase();

  if (!Number.isFinite(Number(params.amount)) || Number(params.amount) <= 0) {
    throw new Error("Enter a valid swap amount.");
  }

  if (!((tokenIn === "USDC" && tokenOut === "EURC") || (tokenIn === "EURC" && tokenOut === "USDC"))) {
    throw new Error("Arc swap currently supports USDC ↔ EURC.");
  }

  return runProductionSwap({
    amount: params.amount,
    tokenIn,
    tokenOut,
    chain: ARC_CHAIN,
    slippageBps: params.slippageBps,
    onStep: params.onStep,
  });
}
