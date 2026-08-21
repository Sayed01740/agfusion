import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a7e7b5d8a4";

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/^0x/, "");
}

function parseUsdcUnits(value: string): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

/**
 * Verify the canonical USDC Transfer event emitted by the configured USDC
 * contract. For settlement, recipient and amount must match exactly.
 */
function hasUsdcTransferTo(
  receipt: any,
  recipient: string,
  expectedAmount: string | undefined,
  usdcAddress: string,
): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient);
  const usdc = normalizeAddress(usdcAddress);
  const expected = expectedAmount != null ? parseUsdcUnits(expectedAmount) : null;

  return logs.some((log: any) => {
    if (normalizeAddress(String(log?.address || "")) !== usdc) return false;
    if (String(log?.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
    const toTopic = String(log?.topics?.[2] || "");
    if (normalizeAddress(toTopic) !== target) return false;
    if (expected == null) return true;
    try {
      return BigInt(String(log?.data || "0x0")) === expected;
    } catch {
      return false;
    }
  });
}

function appendStep(record: TransactionRecord, step: TxStep): TxStep[] {
  return [...(record.steps || []), step];
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
      steps: appendStep(record, {
        name: "Settlement verification",
        state: "pending",
        txHash: record.txHash,
        message: "Receipt verification requires a transaction hash and chain configuration.",
      }),
    };
  }

  const chainConfig = getCctpConfig(chain);
  const chainKey = chainConfig?.rpcProxyKey;
  if (!chainKey || !chainConfig?.usdc) {
    return {
      ...record,
      status: record.status === "success" ? "retryable" : record.status,
      retryable: true,
      message: `${record.message || "Transaction"} · No verified settlement configuration is available for ${chain.replace(/_/g, " ")}.`,
      steps: appendStep(record, {
        name: "Settlement verification",
        state: "pending",
        txHash: record.txHash,
        message: "Verified RPC/USDC configuration unavailable; success is not allowed.",
      }),
    };
  }

  const verified = await verifyReceiptOnChain({
    chainKey,
    txHash: record.txHash,
    attempts: 3,
    delayMs: 1_000,
  });

  if (verified.status === "success") {
    const needsTransferEvent =
      record.token === "USDC" &&
      (record.type === "send" || record.type === "bridge" || record.type === "unified_spend");

    if (needsTransferEvent) {
      const effectiveRecipient =
        record.recipient ||
        (record.type === "bridge"
          ? record.bridgeState?.recipient || record.bridgeState?.walletAddress || undefined
          : undefined);

      if (!effectiveRecipient) {
        return {
          ...record,
          status: "retryable",
          retryable: true,
          message: `${record.message || "Transaction"} · Receipt is confirmed, but the settlement recipient is unavailable for USDC event verification.`,
          steps: appendStep(record, {
            name: "USDC Transfer event",
            state: "pending",
            txHash: record.txHash,
            message: "Recipient is required to prove the expected settlement event.",
          }),
        };
      }

      if (!hasUsdcTransferTo(verified.receipt, effectiveRecipient, record.amount, chainConfig.usdc)) {
        return {
          ...record,
          status: "retryable",
          retryable: true,
          message: `${record.message || "Transaction"} · Receipt is confirmed, but the exact expected USDC Transfer event to the recipient was not observed.`,
          steps: appendStep(record, {
            name: "USDC Transfer event",
            state: "pending",
            txHash: record.txHash,
            message: "Expected USDC contract, recipient, and exact amount were not all observed on-chain.",
          }),
        };
      }

      return {
        ...record,
        status: "success",
        retryable: false,
        steps: [
          ...(record.steps || []),
          {
            name: "Settlement receipt",
            state: "success",
            txHash: record.txHash,
            message: "On-chain receipt confirmed with status 0x1.",
          },
          {
            name: "USDC Transfer event",
            state: "success",
            txHash: record.txHash,
            message: `Exact USDC settlement verified to ${effectiveRecipient}.`,
          },
        ],
        message: `${record.message || "Transaction"} · Settlement verified by receipt and exact USDC Transfer event.`,
      };
    }

    return {
      ...record,
      status: "success",
      retryable: false,
      steps: [
        ...(record.steps || []),
        {
          name: "Settlement receipt",
          state: "success",
          txHash: record.txHash,
          message: "On-chain receipt confirmed with status 0x1.",
        },
      ],
      message: `${record.message || "Transaction"} · Settlement receipt verified on-chain.`,
    };
  }

  if (verified.status === "reverted") {
    return {
      ...record,
      status: "error",
      retryable: false,
      message: `${record.message || "Transaction"} · On-chain receipt reverted on ${chain.replace(/_/g, " ")}.`,
      steps: appendStep(record, {
        name: "Settlement receipt",
        state: "error",
        txHash: record.txHash,
        message: "Receipt status is not 0x1.",
      }),
    };
  }

  return {
    ...record,
    status: "retryable",
    retryable: true,
    message: `${record.message || "Transaction"} · Transaction is not confirmed on ${chain.replace(/_/g, " ")} yet.`,
    steps: appendStep(record, {
      name: "Settlement receipt",
      state: "pending",
      txHash: record.txHash,
      message: "Receipt is unavailable; transaction remains pending/retryable.",
    }),
  };
}
