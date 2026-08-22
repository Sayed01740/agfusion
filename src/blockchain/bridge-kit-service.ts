"use client";

/**
 * Compatibility facade for the legacy Bridge Kit service.
 *
 * AGFusion now has one authoritative browser bridge implementation:
 * src/blockchain/appkit-service.ts. Keeping a second direct BridgeKit import
 * here created two incompatible Circle SDK type graphs in Vercel's install
 * tree (App Kit's nested Bridge Kit versus the direct Bridge Kit dependency).
 * This facade preserves the existing exports used by client-actions while
 * routing all execution through the tested App Kit lifecycle.
 */

import type { ChainId, TransactionRecord } from "@/types";
import {
  runBridgeFlow,
  runBridgeWithRecovery,
} from "@/blockchain/appkit-service";

export interface BridgeKitStepLike {
  name?: string;
  state?: string;
  txHash?: string;
  errorMessage?: string;
  error?: unknown;
}

export interface BridgeKitResultLike {
  state?: string;
  steps?: BridgeKitStepLike[];
  amount?: string;
}

/**
 * Legacy entry point retained for callers that still import this module.
 * Execution is delegated to App Kit so there is only one live bridge path.
 */
export async function runBridgeKitFlow(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  txId?: string;
  recipient?: string;
  failedResult?: unknown;
}): Promise<TransactionRecord> {
  return runBridgeFlow({
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    txId: params.txId,
    recipient: params.recipient,
    preferLive: true,
  });
}

/**
 * Legacy recovery entry point retained for API compatibility.
 * App Kit owns the safe recovery semantics and will never blindly re-burn a
 * bridge that already has a confirmed source burn.
 */
export async function runBridgeKitRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  failedTx?: TransactionRecord | null;
  txId?: string;
}): Promise<TransactionRecord> {
  return runBridgeWithRecovery({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    token: "USDC",
    recipient: params.recipient,
    failedTx: params.failedTx,
    txId: params.txId,
  });
}
