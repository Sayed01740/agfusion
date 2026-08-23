import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a7e7b5d8a4";

/**
 * EVM indexed address topics are 32-byte ABI words, not 20-byte addresses.
 * Always compare the final 20 bytes so both `0xabc...` and padded topics match.
 */
function normalizeAddress(value: string): string {
  const hex = String(value || "").toLowerCase().replace(/^0x/, "");
  return hex.length >= 40 ? hex.slice(-40) : hex;
}

function parseUsdcUnits(value: string): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

function hasUsdcTransferTo(
  receipt: any,
  recipient: string,
  expectedAmount: string | undefined,
  usdcAddress: string,
  allowNetAmount = false,
): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient);
  const usdc = normalizeAddress(usdcAddress);
  const expected = expectedAmount != null ? parseUsdcUnits(expectedAmount) : null;

  return logs.some((log: any) => {
    if (normalizeAddress(String(log?.address || "")) !== usdc) return false;
    if (String(log?.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
    if (normalizeAddress(String(log?.topics?.[2] || "")) !== target) return false;
    if (expected == null || allowNetAmount) return true;
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

function isForwardedBridge(record: TransactionRecord): boolean {
  if (record.type !== "bridge" || !record.bridgeResult || typeof record.bridgeResult !== "object") return false;
  const result = record.bridgeResult as any;
  return Boolean(result.forwardTxHash);
}

/**
 * Final settlement gate. Bridge settlement is verified on the destination
 * chain, while ordinary sends continue to use the supplied chain.
 */
export async function finalizeVerifiedTransaction(
  record: TransactionRecord,
  chain: ChainId | undefined,
): Promise<TransactionRecord> {
  const forwardedBridge = isForwardedBridge(record);

  if (!record.txHash) {
    return {
      ...record,
      status: record.status === "success" ? "retryable" : record.status,
      retryable: true,
      message: `${record.message || "Transaction"} · Settlement could not be verified.`,
      steps: appendStep(record, {
        name: "Settlement verification",
        state: "pending",
        message: "A transaction hash is required for settlement verification.",
      }),
    };
  }

  const verificationChain = forwardedBridge ? record.toChain : chain;
  if (!verificationChain) {
    return {
      ...record,
      status: "retryable",
      retryable: true,
      message: `${record.message || "Transaction"} · Settlement chain could not be resolved.`,
      steps: appendStep(record, {
        name: "Settlement verification",
        state: "pending",
        txHash: record.txHash,
        message: "No destination/source chain is available for receipt verification.",
      }),
    };
  }

  const chainConfig = getCctpConfig(verificationChain);
  const chainKey = chainConfig?.rpcProxyKey;
  if (!chainKey || !chainConfig?.usdc) {
    return {
      ...record,
      status: "retryable",
      retryable: true,
      message: `${record.message || "Transaction"} · No verified settlement configuration is available for ${verificationChain}.`,
      steps: appendStep(record, {
        name: "Settlement verification",
        state: "pending",
        txHash: record.txHash,
        message: "Verified RPC/USDC configuration is unavailable; success is not allowed.",
      }),
    };
  }

  const verified = await verifyReceiptOnChain({
    chainKey,
    txHash: record.txHash,
    attempts: forwardedBridge ? 5 : 3,
    delayMs: forwardedBridge ? 1_200 : 1_000,
  });

  if (verified.status !== "success") {
    return {
      ...record,
      status: "retryable",
      retryable: true,
      message: `${record.message || "Transaction"} · On-chain receipt was not confirmed.`,
      steps: appendStep(record, {
        name: forwardedBridge ? "Destination settlement receipt" : "Settlement receipt",
        state: "pending",
        txHash: record.txHash,
        message: verified.error || "Receipt verification did not confirm a successful transaction.",
      }),
    };
  }

  const needsTransferEvent = record.token === "USDC" && (record.type === "send" || record.type === "bridge" || record.type === "unified_spend");
  if (!needsTransferEvent) {
    return {
      ...record,
      status: "success",
      retryable: false,
      steps: [
        ...(record.steps || []),
        { name: "Settlement receipt", state: "success", txHash: record.txHash, message: "On-chain receipt confirmed with status 0x1." },
      ],
      message: `${record.message || "Transaction"} · Settlement verified on-chain.`,
    };
  }

  const effectiveRecipient = record.recipient || (record.type === "bridge" ? record.bridgeState?.recipient || record.bridgeState?.walletAddress : undefined);
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

  // For forwarded CCTP bridges this receipt is the Circle destination mint.
  // Verify it against the destination USDC contract, recipient, and expected
  // settlement amount. `normalizeAddress` handles ABI-padded indexed topics.
  const transferVerified = hasUsdcTransferTo(
    verified.receipt,
    effectiveRecipient,
    record.amount,
    chainConfig.usdc,
    false,
  );

  if (!transferVerified) {
    return {
      ...record,
      status: "retryable",
      retryable: true,
      message: `${record.message || "Transaction"} · Receipt is confirmed, but the expected USDC Transfer event to the recipient was not observed.`,
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
        name: forwardedBridge ? "Destination settlement receipt" : "Settlement receipt",
        state: "success",
        txHash: record.txHash,
        message: forwardedBridge ? `Circle Forwarding Service destination receipt confirmed on ${verificationChain}.` : "On-chain receipt confirmed with status 0x1.",
      },
      {
        name: "USDC Transfer event",
        state: "success",
        txHash: record.txHash,
        message: `USDC settlement verified to ${effectiveRecipient}.`,
      },
    ],
    message: `${record.message || "Transaction"} · ${forwardedBridge ? "Destination settlement verified by Circle Forwarding Service." : "Settlement verified by receipt and USDC Transfer event."}`,
  };
}
