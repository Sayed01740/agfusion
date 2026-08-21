import type { ChainId, TransactionRecord } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a7e7b5d8a4";

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/^0x/, "");
}

function hasUsdcTransferTo(receipt: any, recipient: string, expectedAmount?: string): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient);
  const expected = expectedAmount != null ? BigInt(Math.round(Number(expectedAmount) * 1_000_000)) : null;

  return logs.some((log: any) => {
    if (String(log?.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
    const toTopic = String(log?.topics?.[2] || "");
    if (normalizeAddress(toTopic) !== target) return false;
    if (expected == null) return true;
    try {
      return BigInt(String(log?.data || "0x0")) >= expected;
    } catch {
      return false;
    }
  });
}

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
    if (record.recipient && record.token === "USDC" && (record.type === "send" || record.type === "bridge" || record.type === "unified_spend")) {
      if (!hasUsdcTransferTo(verified.receipt, record.recipient, record.amount)) {
        return {
          ...record,
          status: "retryable",
          retryable: true,
          message: `${record.message || "Transaction"} · Receipt is confirmed, but the expected USDC Transfer event to the recipient was not observed.`,
        };
      }
    }
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
