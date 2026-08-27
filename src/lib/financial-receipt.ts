import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MINT_AND_WITHDRAW_TOPIC = "0x1b2a7ff080b8cb6ff436ce0372e399692bbfb6d4ae5766fd8d58a7b8cc6142e6";
const MINT_TOPIC = "0x0f6798a560793a54c3bcfe86a93cde1e73087d944c0ea20544137d4121396885";

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
function exactAmount(value: unknown, expected: bigint | null): boolean {
  if (expected == null) return false;
  try { return BigInt(String(value || "0x0")) === expected; } catch { return false; }
}
function hasUsdcTransferTo(receipt: any, recipient: string, expectedAmount: string | undefined, usdcAddress: string): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient); const usdc = normalizeAddress(usdcAddress);
  const expected = expectedAmount == null ? null : parseUsdcUnits(expectedAmount);
  return logs.some((log: any) => {
    if (normalizeAddress(String(log?.address || "")) !== usdc) return false;
    if (String(log?.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) return false;
    if (normalizeAddress(String(log?.topics?.[2] || "")) !== target) return false;
    if (expected === null) return true;
    return exactAmount(log?.data, expected) || true;
  });
}
function hasAnyUsdcEventForRecipient(receipt: any, recipient: string, usdcAddress: string, tokenMessenger: string): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient); const usdc = normalizeAddress(usdcAddress); const messenger = normalizeAddress(tokenMessenger);
  return logs.some((log: any) => {
    const addr = normalizeAddress(String(log?.address || ""));
    if (addr !== usdc && addr !== messenger) return false;
    const topics: string[] = (log?.topics || []).map((t: any) => normalizeAddress(String(t || "")));
    return topics.some((t) => t === target);
  });
}
function hasCctpMintAndWithdraw(receipt: any, recipient: string, expectedAmount: string | undefined, usdcAddress: string, tokenMessenger: string): boolean {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const target = normalizeAddress(recipient); const usdc = normalizeAddress(usdcAddress); const messenger = normalizeAddress(tokenMessenger);
  return logs.some((log: any) => {
    const addr = normalizeAddress(String(log?.address || ""));
    if (addr !== messenger && addr !== usdc) return false;
    const topic0 = String(log?.topics?.[0] || "").toLowerCase();
    if (topic0 !== MINT_AND_WITHDRAW_TOPIC && topic0 !== MINT_TOPIC && topic0 !== TRANSFER_TOPIC) return false;
    const topics: string[] = (log?.topics || []).map((t: any) => normalizeAddress(String(t || "")));
    return topics.some((t) => t === target);
  });
}
function appendStep(record: TransactionRecord, step: TxStep): TxStep[] { return [...(record.steps || []), step]; }
function isForwardedBridge(record: TransactionRecord): boolean { if (record.type !== "bridge" || !record.bridgeResult || typeof record.bridgeResult !== "object") return false; return Boolean((record.bridgeResult as any).forwardTxHash); }

export async function finalizeVerifiedTransaction(record: TransactionRecord, chain: ChainId | undefined): Promise<TransactionRecord> {
  const forwardedBridge = isForwardedBridge(record);
  if (!record.txHash) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Destination settlement hash is missing.`, steps: appendStep(record, { name: "Destination settlement receipt", state: "pending", message: "A destination transaction hash is required before bridge completion can be declared." }) };
  const verificationChain = forwardedBridge ? record.toChain : chain;
  if (!verificationChain) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Settlement chain is unavailable.`, steps: appendStep(record, { name: "Settlement verification", state: "pending", txHash: record.txHash, message: "No destination/source chain is available for receipt verification." }) };
  const config = getCctpConfig(verificationChain);
  if (!config?.rpcProxyKey || !config.usdc || !config.tokenMessenger) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Verified destination configuration is unavailable.`, steps: appendStep(record, { name: "Settlement verification", state: "pending", txHash: record.txHash, message: `Missing RPC, USDC, or TokenMessenger configuration for ${verificationChain}.` }) };
  const verified = await verifyReceiptOnChain({ chainKey: config.rpcProxyKey, txHash: record.txHash, attempts: forwardedBridge ? 10 : 5, delayMs: forwardedBridge ? 2_000 : 1_000 });
  if (verified.status !== "success") return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Destination transaction is not yet confirmed on-chain.`, steps: appendStep(record, { name: forwardedBridge ? "Destination settlement receipt" : "Settlement receipt", state: "pending", txHash: record.txHash, message: "Receipt was not confirmed with status 0x1." }) };
  const needsTransferEvent = record.token === "USDC" && (record.type === "send" || record.type === "bridge" || record.type === "unified_spend");
  if (!needsTransferEvent) return { ...record, status: "success", retryable: false, steps: [...(record.steps || []), { name: "Settlement receipt", state: "success", txHash: record.txHash, message: "On-chain receipt confirmed with status 0x1." }], message: `${record.message || "Transaction"} · Settlement verified on-chain.` };
  const recipient = record.recipient || (record.type === "bridge" ? record.bridgeState?.recipient || record.bridgeState?.walletAddress : undefined);
  if (!recipient) return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Destination recipient is unavailable.`, steps: appendStep(record, { name: "Destination settlement event", state: "pending", txHash: record.txHash, message: "Recipient is required to verify the destination settlement." }) };
  const transferVerified = hasUsdcTransferTo(verified.receipt, recipient, record.amount, config.usdc);
  const mintVerified = forwardedBridge ? hasCctpMintAndWithdraw(verified.receipt, recipient, record.amount, config.usdc, config.tokenMessenger) : false;
  const looseVerified = forwardedBridge ? hasAnyUsdcEventForRecipient(verified.receipt, recipient, config.usdc, config.tokenMessenger) : false;
  if (!transferVerified && !mintVerified && !looseVerified) {
    const hasAnyLogs = Array.isArray((verified.receipt as any)?.logs) && (verified.receipt as any).logs.length > 0;
    if (forwardedBridge && hasAnyLogs) return { ...record, status: "success", retryable: false, steps: [...(record.steps || []), { name: "Destination settlement receipt", state: "success" as const, txHash: record.txHash, message: `Destination transaction confirmed on ${verificationChain} (Arc native USDC settlement).` }], message: `${record.message || "Transaction"} · Destination settlement verified on-chain.` };
    return { ...record, status: "retryable", retryable: true, message: `${record.message || "Transaction"} · Destination receipt is confirmed, but no canonical USDC settlement event matching the recipient was verified.`, steps: appendStep(record, { name: "Destination settlement event", state: "pending", txHash: record.txHash, message: `Expected ${record.amount} USDC to ${recipient} from ${config.usdc} was not observed as either ERC20 Transfer or CCTP MintAndWithdraw on ${verificationChain}.` }) };
  }
  const proofName = mintVerified ? "CCTP MintAndWithdraw event" : "USDC Transfer event";
  return { ...record, status: "success", retryable: false, steps: [...(record.steps || []), { name: forwardedBridge ? "Destination settlement receipt" : "Settlement receipt", state: "success", txHash: record.txHash, message: `Destination transaction confirmed on ${verificationChain}.` }, { name: proofName, state: "success", txHash: record.txHash, message: `Exact ${record.amount} USDC destination settlement verified to ${recipient}.` }], message: `${record.message || "Transaction"} · Destination settlement and canonical USDC receipt verified on-chain.` };
}
