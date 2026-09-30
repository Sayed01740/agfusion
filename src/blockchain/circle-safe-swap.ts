import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { runProductionSwap } from "@/blockchain/production-swap";
import { IS_ARC_MAINNET } from "@/lib/arc-chain";

/**
 * Arc swap execution entry point — supports both Arc Mainnet (5042) and Arc Testnet (5042002).
 *
 * AGFusion uses its own Arc DEX path (production-swap.ts) which works with
 * the connected EIP-1193 wallet including Circle Email/Smart Wallet adapter.
 * Circle's hosted Stablecoin Swap Service is not used here because it does
 * not support Arc as a chain.
 */

const ARC_MAINNET_CHAIN: ChainId = "Arc_Mainnet";
const ARC_TESTNET_CHAIN: ChainId = "Arc_Testnet";

/** Resolved active Arc chain based on runtime environment */
const ACTIVE_ARC_CHAIN: ChainId = IS_ARC_MAINNET ? ARC_MAINNET_CHAIN : ARC_TESTNET_CHAIN;

function isArcChain(chain: ChainId): boolean {
  return chain === "Arc" || chain === "Arc_Mainnet" || chain === "Arc_Testnet";
}

export async function runCircleSafeSwapFlow(params: {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  chain: ChainId;
  slippageBps?: number;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  if (!isArcChain(params.chain)) {
    throw new Error(
      `Swap is only supported on Arc networks. Received: "${params.chain}". ` +
      `Please switch to Arc ${IS_ARC_MAINNET ? "Mainnet" : "Testnet"} in your wallet.`,
    );
  }

  const tokenIn = params.tokenIn.toUpperCase();
  const tokenOut = params.tokenOut.toUpperCase();

  if (!Number.isFinite(Number(params.amount)) || Number(params.amount) <= 0) {
    throw new Error("Enter a valid swap amount.");
  }

  // Route to the matching Arc chain — if the caller passes Arc_Testnet but we're
  // on mainnet (or vice-versa), we normalise to the active chain so the wallet
  // switch lands on the right network.
  const targetChain: ChainId = params.chain === "Arc_Mainnet" || params.chain === "Arc"
    ? ARC_MAINNET_CHAIN
    : params.chain === "Arc_Testnet"
      ? ARC_TESTNET_CHAIN
      : ACTIVE_ARC_CHAIN;

  return runProductionSwap({
    amount: params.amount,
    tokenIn,
    tokenOut,
    chain: targetChain,
    slippageBps: params.slippageBps,
    onStep: params.onStep,
  });
}
