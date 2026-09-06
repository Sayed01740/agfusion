/**
 * Single-signature batch send ("disperse") on Arc Testnet.
 *
 * When the AGFusionDisperse contract is deployed and configured
 * (NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS), a whole batch of USDC/EURC/cirBTC
 * payouts is executed with ONE wallet signature via disperseToken():
 *
 *   1. approve() the Disperse contract once (max) — only if allowance is short
 *   2. disperseToken(token, recipients, values) — the single batch signature
 *
 * After the first max-approval, every future batch for that token is a single
 * signature. If the contract is NOT configured, callers should fall back to the
 * sequential per-recipient send path (see the Batch panel).
 */
import {
  encodeFunctionData,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
import { explorerTxUrl } from "@/lib/arc-chain";
import { arcPublicClient, encodeApprove, readAllowance } from "@/lib/dapp/erc20";
import {
  DISPERSE_ADDRESS,
  isAddress,
  isDisperseConfigured,
  type ArcToken,
} from "@/lib/dapp/tokens";
import {
  getInjectedProvider,
  requestAccounts,
  switchToArcTestnet,
  type InjectedProvider,
} from "@/sdk/wallet-adapter";
import type { TransactionRecord, TxStep } from "@/types";
import { uid } from "@/lib/utils";

export type BatchRow = { label?: string; address: string; amount: string };

const DISPERSE_ABI = [
  {
    type: "function",
    name: "disperseToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipients", type: "address[]" },
      { name: "values", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const APPROVE_GAS = 90_000n;
// Conservative: base overhead + per-recipient transferFrom cost.
function disperseGas(count: number): bigint {
  return 120_000n + 48_000n * BigInt(count);
}

export type ValidatedBatch = {
  recipients: Address[];
  values: bigint[];
  total: bigint;
  totalDisplay: string;
};

/** Validate rows and encode base-unit values; throws with a clear message. */
export function validateBatch(rows: BatchRow[], token: ArcToken): ValidatedBatch {
  const cleaned = rows.filter((r) => r.address.trim() || r.amount.trim());
  if (cleaned.length === 0) throw new Error("Add at least one recipient.");

  const recipients: Address[] = [];
  const values: bigint[] = [];
  let total = 0n;

  cleaned.forEach((row, i) => {
    const who = row.label?.trim() || `Recipient ${i + 1}`;
    if (!isAddress(row.address)) {
      throw new Error(`Invalid address for ${who}.`);
    }
    const n = Number(row.amount);
    if (!row.amount || !Number.isFinite(n) || n <= 0) {
      throw new Error(`Enter a valid amount for ${who}.`);
    }
    const value = parseUnits(row.amount.trim(), token.decimals);
    recipients.push(row.address.trim() as Address);
    values.push(value);
    total += value;
  });

  // Guard against duplicate recipients (usually a paste mistake).
  const seen = new Set(recipients.map((a) => a.toLowerCase()));
  if (seen.size !== recipients.length) {
    throw new Error("Duplicate recipient address in the batch.");
  }

  return {
    recipients,
    values,
    total,
    totalDisplay: formatUnits(total, token.decimals),
  };
}

/**
 * Execute a batch with a single disperse signature (plus a one-time approval
 * when needed). Requires isDisperseConfigured() === true.
 */
export async function runBatchDisperse(params: {
  token: ArcToken;
  rows: BatchRow[];
  onStep?: (steps: TxStep[]) => void;
  provider?: InjectedProvider;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Batch send must run in the browser with your connected wallet.");
  }
  if (!isDisperseConfigured()) {
    throw new Error(
      "Disperse contract not configured. Deploy AGFusionDisperse and set NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS.",
    );
  }

  const spender = DISPERSE_ADDRESS as Address;
  const { recipients, values, total, totalDisplay } = validateBatch(params.rows, params.token);

  const id = uid("tx");
  const steps: TxStep[] = [
    { name: "Connect wallet", state: "active" },
    { name: "Switch to Arc Testnet", state: "pending" },
    { name: `Approve ${params.token.symbol}`, state: "pending" },
    { name: `Send to ${recipients.length} recipients`, state: "pending" },
    { name: "Confirm finality", state: "pending" },
  ];
  const emit = () => params.onStep?.(steps.map((s) => ({ ...s })));
  emit();

  const provider = params.provider || (await getInjectedProvider());
  const accounts = await requestAccounts(provider);
  const from = accounts[0] as Address | undefined;
  if (!from) throw new Error("No wallet account — connect your wallet first.");
  steps[0].state = "success";
  steps[1].state = "active";
  emit();

  await switchToArcTestnet(provider);
  steps[1].state = "success";
  steps[2].state = "active";
  emit();

  const publicClient = arcPublicClient();

  // --- Step 1: approval (only when the current allowance is insufficient) ---
  let approvalTxHash: `0x${string}` | undefined;
  const allowance = await readAllowance(params.token.address, from, spender);
  if (allowance < total) {
    try {
      approvalTxHash = String(
        await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: params.token.address,
              data: encodeApprove(spender),
              gas: `0x${APPROVE_GAS.toString(16)}`,
              value: "0x0",
            },
          ],
        }),
      ) as `0x${string}`;
      steps[2].txHash = approvalTxHash;
      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash, timeout: 60_000 });
      steps[2].state = "success";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/4001|reject|denied|cancel/i.test(msg)) throw new Error("Approval cancelled in wallet.");
      throw new Error(msg || "Token approval failed.");
    }
  } else {
    steps[2].state = "noop";
    steps[2].message = "Already approved";
  }
  steps[3].state = "active";
  emit();

  // --- Step 2: the single disperse signature ---
  const data = encodeFunctionData({
    abi: DISPERSE_ABI,
    functionName: "disperseToken",
    args: [params.token.address, recipients, values],
  });

  let hash: `0x${string}`;
  try {
    hash = String(
      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: spender,
            data,
            gas: `0x${disperseGas(recipients.length).toString(16)}`,
            value: "0x0",
          },
        ],
      }),
    ) as `0x${string}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/4001|reject|denied|cancel/i.test(msg)) throw new Error("Batch cancelled in wallet.");
    throw new Error(msg || "Batch send failed.");
  }
  steps[3].state = "success";
  steps[3].txHash = hash;
  steps[4].state = "active";
  emit();

  let status: TransactionRecord["status"] = "success";
  let finalityMessage = "Confirmed on Arc Testnet";
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      status = "error";
      finalityMessage = "Batch reverted on Arc Testnet";
      steps[4].state = "error";
      steps[4].message = finalityMessage;
    } else {
      steps[4].state = "success";
    }
  } catch {
    status = "retryable";
    finalityMessage = "Submitted — finality still pending. Check the explorer before retrying.";
    steps[4].state = "pending";
    steps[4].message = finalityMessage;
  }
  steps[4].txHash = hash;
  emit();

  return {
    id,
    type: "send",
    status,
    retryable: status === "retryable",
    amount: totalDisplay,
    token: params.token.symbol,
    fromChain: "Arc_Testnet",
    toChain: "Arc_Testnet",
    recipient: `${recipients.length} recipients`,
    recipientLabel: `Batch · ${recipients.length} payouts`,
    feeUsd: 0.04,
    steps,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    createdAt: new Date().toISOString(),
    message: `Single-signature batch of ${recipients.length} ${params.token.symbol} payouts — ${finalityMessage}`,
    executionMode: "live",
  };
}
