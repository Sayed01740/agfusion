import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a7e7b5d8a4";
function normalizeAddress(value: string): string { return value.toLowerCase().replace(/^0x/, ""); }
function parseUsdcUnits(value: string): bigint | null { const normalized = String(value || "").trim(); if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null; const [whole, fraction = ""] = normalized.split("."); return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6)); }
function hasUsdcTransferTo(receipt: any, recipient: string, expectedAmount: string | undefined, usdcAddress: string, allowNetAmount = false): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : []; const target = normalizeAddress(recipient); const usdc = normalizeAddress(usdcAddress); const expected = expectedAmount != null ? parseUsdcUnits(expectedAmount) : null;
  return logs.some((log: any) => { if (normalizeAddress(String(log?.address || "")) !== usdc) return false; if (String(log?.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false; if (normalizeAddress(String(log?.topics?.[2] || "")) !== target) return false; if (expected == null || allowNetAmount) return true; try { return BigInt(String(log?.data || "0x0")) === expected; } catch { return false; } });
}
function appendStep(record: TransactionRecord, step: TxStep): TxStep[] { return [...(record.steps || []), step]; }
function getForwardedMintHash(record: TransactionRecord): string | undefined {
  if (record.type !== "bridge" || !record.bridgeResult || typeof record.bridgeResult !== "object") return undefined;
  const result = record.bridgeResult as any;
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const mint = steps.find((step: any) => String(step?.name || "").toLowerCase().includes("mint"));
  if (result.forwardTxHash && mint?.state === "success") return String(result.forwardTxHash);
  if (mint?.forwarded === true && result.forwardTxHash) return String(result.forwardTxHash);
  return undefined;
}
function isForwardedBridge(record: TransactionRecord): boolean { return Boolean(getForwardedMintHash(record)); }

/** Final settlement gate. Never upgrades an unverified bridge to success. */
export async function finalizeVerifiedTransaction(record: TransactionRecord, chain: ChainId | undefined): Promise<TransactionRecord> {
  const forwardedBridge = isForwardedBridge(record);
  const forwardedMintHash = getForwardedMintHash(record);

  // Forwarding Service already verifies the destination transaction before
  // returning forwardTxHash. Verify that same destination receipt again here.
  // Do not apply the generic source-chain USDC Transfer-event gate to a
  // destination mint transaction, because it can use the wrong chain/USDC
  // configuration and incorrectly downgrade a settled bridge to retryable.
  if (forwardedBridge && forwardedMintHash && record.txHash && normalizeAddress(forwardedMintHash) === normalizeAddress(record.txHash)) {
    const destinationChain = record.toChain;
    const destinationConfig = destinationChain ? getCctpConfig(destinationChain) : null;
    if (!destinationConfig) {
      return { ...record, status: "retryable", retryable: true, message: `${record.message || "Bridge"} · Destination settlement chain configuration is unavailable.`, steps: appendStep(record, { name: "Settlement verification", state: "pending", txHash: record.txHash, message: "Forwarded mint hash is present, but the destination chain configuration could not be resolved." }) };
    }

    const destinationVerified = await verifyReceiptOnChain({ chainKey: destinationConfig.rpcProxyKey, txHash: record.txHash, attempts: 5, delayMs: 1_200 });
    if (destinationVerified.status === "success") {
      const recipient = record.recipient || record.bridgeState?.recipient || record.bridgeState?.walletAddress;
      return {
        ...record,
        status: "success",
        retryable: false,
        steps: [
          ...(record.steps || []),
          { name: "Destination settlement receipt", state: "success", txHash: record.txHash, message: `Circle Forwarding Service destination receipt confirmed on ${destinationChain}.` },
          { name: "USDC Transfer event", state: "success", txHash: record.txHash, message: recipient ? `Destination mint settlement confirmed to ${recipient} by Circle's forwarded-mint lifecycle.` : "Destination mint settlement confirmed by Circle's forwarded-mint lifecycle." },
        ],
        message: `${record.message || "Bridge"} · Destination settlement verified by Circle Forwarding Service.`,
      };
    }

    return {
      ...record,
      status: "retryable",
      retryable: true,
      message: `${record.message || "Bridge"} · Circle supplied a destination mint hash, but its destination receipt is not yet confirmed.`,
      steps: appendStep(record, { name: "Destination settlement receipt", state: "pending", txHash: record.txHash, message: destinationVerified.error || "Destination receipt is not yet confirmed; the source burn remains recoverable." }),
    };
  }

  if (!chain || !record.txHash) {
    return { ...record, status: record.status === "success" ? "retryable" : record.status, retryable: true, message: `${record.message || "Transaction"} · Settlement could not be verified.`, steps: appendStep(record, { name: "Settlement verification", state: "pending", txHash: record.txHash, message: "Receipt verification requires a transaction hash and chain configuration." }) };
  }

  const chainConfig = getCctpConfig(chain); const chainKey = chainConfig?.rpcProxyKey;
  if (!chainKey || !chainConfig?.usdc) return { ...record, status: record.status === "success" ? "retryable" : record.status, retryable: true, message: `${record.message || "Transaction"} · No verified settlement configuration is available for ${chain.replace(/_/g, " ")}.`, steps: appendStep(record, { name: "Settlement verification", state: "pending", txHash: record.txHash, message: "Verified RPC/USDC configuration unavailable; success is not allowed." }) };

  const verified = await verifyReceiptOnChain({ chainKey, txHash: record.txHash, attempts: 3, delayMs: 1_000 });
  if (verified.status === "success") {
    const needsTransferEvent = record.token === "USDC" && (record.type === "send" || record.type === "bridge" || record.type === "unified_spend");
    if (needsTransferEvent) {
      const effectiveRecipient = record.recipient || (record.type === "bridge" ? record.bridgeState?.recipient || record.bridgeState?.walletAddress || undefined : undefined);
      if (!effectiveRecipient) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Receipt is confirmed, but the settlement recipient is unavailable for USDC event verification.`, steps: appendStep(record, { name: "USDC Transfer event", state: "pending", txHash: record.txHash, message: "Recipient is required to prove the expected settlement event." }) };
      const transferVerified = hasUsdcTransferTo(verified.receipt, effectiveRecipient, record.amount, chainConfig.usdc, forwardedBridge);
      if (!transferVerified) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Receipt is confirmed, but the expected USDC Transfer event to the recipient was not observed.`, steps: appendStep(record, { name: "USDC Transfer event", state: "pending", txHash: record.txHash, message: forwardedBridge ? "The forwarded mint receipt did not contain a USDC Transfer event to the configured recipient." : "Expected USDC contract, recipient, and exact amount were not all observed on-chain." }) };
      return { ...record, status: "success", retryable: false, steps: [...(record.steps || []), { name: "Settlement receipt", state: "success", txHash: record.txHash, message: "On-chain receipt confirmed with status 0x1." }, { name: "USDC Transfer event", state: "success", txHash: record.txHash, message: forwardedBridge ? `USDC settlement verified to ${effectiveRecipient}; destination amount reflects applicable Circle bridge/forwarding fees.` : `Exact USDC settlement verified to ${effectiveRecipient}.` }], message: `${record.message || "Transaction"} · Settlement verified by receipt and USDC Transfer event.` };
    }
    return { ...record, status: "success", retryable: false, steps: [...(record.steps || []), { name: "Settlement receipt", state: "success", txHash: record.txHash, message: "On-chain receipt confirmed with status 0x1." }], message: `${record.message || "Transaction"} · Settlement verified on-chain.` };
  }
  return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · On-chain receipt was not confirmed.`, steps: appendStep(record, { name: "Settlement receipt", state: "pending", txHash: record.txHash, message: verified.error || "Receipt verification did not confirm a successful transaction." }) };
}
