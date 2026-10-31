/**
 * x402 Arc Testnet USDC receipt verifier.
 *
 * This module is deliberately independent from the endpoint. The endpoint
 * remains disabled until the database schema is applied and the verifier plus
 * atomic replay guard are wired together and reviewed.
 */
export const X402_ARC_TESTNET = {
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network",
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
};

type RpcReceipt = {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  logs?: RpcLog[];
};

export type X402Verification =
  | { ok: true; txHash: string; payer: string; recipient: string; amount: string; blockNumber: string; chainId: 5042002 }
  | { ok: false; reason: "invalid_hash" | "rpc_unavailable" | "wrong_chain" | "not_mined" | "reverted" | "receipt_mismatch" | "payment_not_found" | "ambiguous_payment" };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export async function verifyArcTestnetUsdcPayment(opts: {
  txHash: string;
  recipient: string;
  fetchImpl?: typeof fetch;
}): Promise<X402Verification> {
  const txHash = opts.txHash.toLowerCase();
  const recipient = opts.recipient.toLowerCase();
  if (!HASH_RE.test(txHash) || !ADDRESS_RE.test(recipient)) {
    return { ok: false, reason: "invalid_hash" };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return { ok: false, reason: "rpc_unavailable" };

  try {
    const rpc = async (method: string, params: unknown[]) => {
      const response = await fetchImpl(X402_ARC_TESTNET.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Arc Testnet RPC unavailable");
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error || body.result === undefined) throw new Error(body.error?.message || "Invalid RPC response");
      return body.result;
    };

    const chainId = await rpc("eth_chainId", []) as string;
    if (Number.parseInt(chainId, 16) !== X402_ARC_TESTNET.chainId) {
      return { ok: false, reason: "wrong_chain" };
    }

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]) as RpcReceipt | null;
    if (!receipt) return { ok: false, reason: "not_mined" };
    if (receipt.status !== "0x1") return { ok: false, reason: "reverted" };
    const receiptBlockNumber = receipt.blockNumber;
    if (
      receipt.transactionHash?.toLowerCase() !== txHash ||
      !receiptBlockNumber ||
      !/^0x[0-9a-fA-F]+$/.test(receiptBlockNumber)
    ) {
      return { ok: false, reason: "receipt_mismatch" };
    }

    const matching = (receipt.logs || []).filter((log) =>
      log.address?.toLowerCase() === X402_ARC_TESTNET.token &&
      log.topics?.[0]?.toLowerCase() === X402_ARC_TESTNET.transferTopic &&
      topicAddress(log.topics?.[1]) !== null &&
      topicAddress(log.topics?.[2]) === recipient
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
