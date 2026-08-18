import type { ChainId, TransactionRecord } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

/** Final settlement gate for live financial actions. */
export async function finalizeVerifiedTransaction(
  record: TransactionRecord,
  chain: ChainId | undefined,
): Promise<TransactionRecord> {
  if (!chain || !record.txHash) {
    return {
      ...record,
      status: record.status === "success" ? "retryable" : record.status,
      retryable: true,
      message: `${record.message || "Transaction"} · Settlement could not be verified.`,
    };
  }

  const chainKey = getCctpConfig(chain)?.rpcProxyKey;
  if (!chainKey) {
    return {
      ...record,
      status: record.status === "success" ? "retryable" : record.status,
      retryable: true,
      message: `${record.message || "Transaction"} · No verified RPC is configured for ${chain.replace(/_/g, " ")}.`,
    };
  }

  const verified = await verifyReceiptOnChain({
    chainKey,
    txHash: record.txHash,
    attempts: 3,
    delayMs: 1_000,
  });

  if (verified.status === "success") {
    return { ...record, status: "success", retryable: false };
  }
  if (verified.status === "reverted") {
    return {
      ...record,
      status: "error",
      retryable: false,
      message: `${record.message || "Transaction"} · On-chain receipt reverted on ${chain.replace(/_/g, " ")}.`,
    };
  }
  return {
    ...record,
    status: "retryable",
    retryable: true,
    message: `${record.message || "Transaction"} · Transaction is not confirmed on ${chain.replace(/_/g, " ")} yet.`,
  };
}
