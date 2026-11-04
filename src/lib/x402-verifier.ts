/**
 * x402 Arc Testnet USDC receipt verifier.
 *
 * This module is deliberately independent from the endpoint. The endpoint
 * remains disabled until the database schema is applied and the verifier plus
 * atomic replay guard are wired together and reviewed.
 */
export const X402_ARC_TESTNET = {
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.io",
  token: "0x3600000000000000000000000000000000000000",
  decimals: 6,
  amount: "1000", // 0.001 USDC in base units
  transferTopic:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
} as const;

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  removed?: boolean;
};

type RpcReceipt = {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  blockHash?: string;
  logs?: RpcLog[];
};

type RpcBlock = {
  hash?: string;
  number?: string;
};

export type X402Verification =
  | { ok: true; txHash: string; payer: string; recipient: string; amount: string; blockNumber: string; chainId: 5042002 }
  | { ok: false; reason: "invalid_hash" | "invalid_recipient" | "rpc_unavailable" | "wrong_chain" | "not_mined" | "reverted" | "receipt_mismatch" | "block_not_canonical" | "payment_not_found" | "ambiguous_payment" };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RPC_TIMEOUT_MS = 10_000;
const MAX_RPC_RESPONSE_BYTES = 256 * 1024;
const MAX_RECEIPT_LOGS = 256;

async function readBoundedRpcJson(response: Response): Promise<{
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}> {
  const contentLength = Number(response.headers?.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RPC_RESPONSE_BYTES) {
    throw new Error("Arc Testnet RPC response exceeded the size limit");
  }

  let text: string;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RPC_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("Arc Testnet RPC response exceeded the size limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  } else {
    // Lightweight fallback for deterministic fetch mocks in unit tests.
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RPC_RESPONSE_BYTES) {
      throw new Error("Arc Testnet RPC response exceeded the size limit");
    }
  }

  return JSON.parse(text) as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
}

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x0{24}[0-9a-fA-F]{40}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export async function verifyArcTestnetUsdcPayment(opts: {
  txHash: string;
  recipient: string;
  fetchImpl?: typeof fetch;
}): Promise<X402Verification> {
  const txHash = opts.txHash.toLowerCase();
  const recipient = opts.recipient.toLowerCase();
  if (!HASH_RE.test(txHash)) {
    return { ok: false, reason: "invalid_hash" };
  }
  if (!ADDRESS_RE.test(recipient) || recipient === ZERO_ADDRESS) {
    return { ok: false, reason: "invalid_recipient" };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return { ok: false, reason: "rpc_unavailable" };

  try {
    // One shared deadline bounds the complete three-call verification sequence.
    const signal = AbortSignal.timeout(RPC_TIMEOUT_MS);
    let rpcRequestId = 0;
    const rpc = async (method: string, params: unknown[]) => {
      const requestId = ++rpcRequestId;
      const response = await fetchImpl(X402_ARC_TESTNET.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Arc Testnet RPC unavailable");
      const body = await readBoundedRpcJson(response);
      if (
        !body ||
        typeof body !== "object" ||
        body.jsonrpc !== "2.0" ||
        body.id !== requestId ||
        (Object.hasOwn(body, "result") === Object.hasOwn(body, "error"))
      ) {
        throw new Error("Invalid JSON-RPC response envelope");
      }
      if (Object.hasOwn(body, "error")) {
        if (
          !body.error ||
          typeof body.error !== "object" ||
          !Number.isInteger(body.error.code) ||
          typeof body.error.message !== "string"
        ) {
          throw new Error("Malformed JSON-RPC error object");
        }
        throw new Error(body.error.message);
      }
      return body.result;
    };

    const chainId = await rpc("eth_chainId", []) as string;
    if (
      typeof chainId !== "string" ||
      !/^0x[0-9a-f]+$/i.test(chainId) ||
      BigInt(chainId) !== BigInt(X402_ARC_TESTNET.chainId)
    ) {
      return { ok: false, reason: "wrong_chain" };
    }

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]) as RpcReceipt | null;
    if (!receipt) return { ok: false, reason: "not_mined" };
    if (!Array.isArray(receipt.logs) || receipt.logs.length > MAX_RECEIPT_LOGS) {
      return { ok: false, reason: "receipt_mismatch" };
    }
    if (receipt.status !== "0x1") return { ok: false, reason: "reverted" };

    const receiptBlockNumber = receipt.blockNumber;
    const receiptBlockHash = receipt.blockHash;
    if (
      receipt.transactionHash?.toLowerCase() !== txHash ||
      !receiptBlockNumber ||
      !/^0x[0-9a-fA-F]+$/.test(receiptBlockNumber) ||
      !receiptBlockHash ||
      !HASH_RE.test(receiptBlockHash)
    ) {
      return { ok: false, reason: "receipt_mismatch" };
    }

    // Ensure the receipt still points to the canonical block at its height.
    // This is a consistency check, not a substitute for a chain-specific
    // finalized-block guarantee.
    const canonicalBlock = await rpc("eth_getBlockByNumber", [receiptBlockNumber, false]) as RpcBlock | null;
    if (
      !canonicalBlock?.hash ||
      canonicalBlock.hash.toLowerCase() !== receiptBlockHash.toLowerCase() ||
      canonicalBlock.number?.toLowerCase() !== receiptBlockNumber.toLowerCase()
    ) {
      return { ok: false, reason: "block_not_canonical" };
    }

    const matching = (receipt.logs || []).filter((log) =>
      log.removed !== true &&
      log.address?.toLowerCase() === X402_ARC_TESTNET.token &&
      log.topics?.length === 3 &&
      log.topics[0]?.toLowerCase() === X402_ARC_TESTNET.transferTopic &&
      topicAddress(log.topics[1]) !== null &&
      topicAddress(log.topics[1]) !== "0x0000000000000000000000000000000000000000" &&
      topicAddress(log.topics[2]) === recipient
    );

    if (matching.length > 1) return { ok: false, reason: "ambiguous_payment" };
    const transfer = matching[0];
    const transferData = transfer?.data;
    if (!transferData || !/^0x[0-9a-fA-F]{64}$/.test(transferData)) {
      return { ok: false, reason: "payment_not_found" };
    }

    const amount = BigInt(transferData);
    if (amount !== BigInt(X402_ARC_TESTNET.amount)) {
      return { ok: false, reason: "payment_not_found" };
    }

    const payer = topicAddress(transfer.topics?.[1]);
    if (!payer) return { ok: false, reason: "payment_not_found" };

    return {
      ok: true,
      txHash,
      payer,
      recipient,
      amount: amount.toString(),
      blockNumber: BigInt(receiptBlockNumber).toString(),
      chainId: 5042002,
    };
  } catch {
    return { ok: false, reason: "rpc_unavailable" };
  }
}
