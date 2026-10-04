/**
 * Client integration for AGFusionEscrow on Arc Network.
 * Handles creating on-chain agent tasks, submitting proofs, releasing funds,
 * and refunds on Arc Testnet (chainId 5042002).
 */
import {
  encodeFunctionData,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
import { explorerTxUrl, getArcNetworkMeta } from "@/lib/arc-chain";
import { arcPublicClient, encodeApprove, readAllowance } from "@/lib/dapp/erc20";
import { ARC_TOKENS, isAddress, type ArcToken } from "@/lib/dapp/tokens";
import {
  getChainId,
  getInjectedProvider,
  requestAccounts,
  switchToArcNetwork,
  type InjectedProvider,
} from "@/sdk/wallet-adapter";
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { uid } from "@/lib/utils";

export const ESCROW_ADDRESS: Address | undefined = (() => {
  const env =
    process.env.NEXT_PUBLIC_AGFUSION_ESCROW_ADDRESS ||
    process.env.NEXT_PUBLIC_ESCROW_CONTRACT;
  return env && isAddress(env) ? (env.toLowerCase() as Address) : undefined;
})();

export function isEscrowConfigured(): boolean {
  return Boolean(ESCROW_ADDRESS);
}

export const ESCROW_ABI = [
  {
    type: "function",
    name: "createTask",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
      { name: "taskDetailsUri", type: "string" },
    ],
    outputs: [{ name: "taskId", type: "uint256" }],
  },
  {
    type: "function",
    name: "createTaskNative",
    stateMutability: "payable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "durationSeconds", type: "uint256" },
      { name: "taskDetailsUri", type: "string" },
    ],
    outputs: [{ name: "taskId", type: "uint256" }],
  },
  {
    type: "function",
    name: "submitProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "proofUri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releasePayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getTask",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "agent", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "taskDetailsUri", type: "string" },
          { name: "proofUri", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "totalTasks",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type OnChainEscrowTask = {
  id: number;
  client: string;
  agent: string;
  token: string;
  amountFormatted: string;
  createdAt: number;
  deadline: number;
  status: "Active" | "Submitted" | "Released" | "Disputed" | "Refunded";
  taskDetailsUri: string;
  proofUri: string;
};

const STATUS_MAP = ["Active", "Submitted", "Released", "Disputed", "Refunded"] as const;

export async function fetchEscrowTask(taskId: number): Promise<OnChainEscrowTask | null> {
  if (!ESCROW_ADDRESS) return null;
  try {
    const raw = (await arcPublicClient().readContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "getTask",
      args: [BigInt(taskId)],
    })) as any;

    return {
      id: Number(raw.id),
      client: raw.client,
      agent: raw.agent,
      token: raw.token,
      amountFormatted: formatUnits(raw.amount, 18),
      createdAt: Number(raw.createdAt),
      deadline: Number(raw.deadline),
      status: STATUS_MAP[raw.status] ?? "Active",
      taskDetailsUri: raw.taskDetailsUri,
      proofUri: raw.proofUri,
    };
  } catch {
    return null;
  }
}

export type CreateEscrowParams = {
  agentAddress: Address;
  amount: string;
  token?: ArcToken;
  durationSeconds?: number;
  taskTitle: string;
  onStep?: (steps: TxStep[]) => void;
};

export async function runCreateEscrowTask({
  agentAddress,
  amount,
  token = ARC_TOKENS.USDC,
  durationSeconds = 86400,
  taskTitle,
  onStep,
}: CreateEscrowParams): Promise<TransactionRecord> {
  const provider = await getInjectedProvider();
  if (!provider) throw new Error("No browser wallet detected.");

  const currentChainId = await getChainId(provider);
  const meta = getArcNetworkMeta(currentChainId);
  if (!meta.isArc) {
    await switchToArcNetwork(provider);
  }

  const accounts = await requestAccounts(provider);
  const user = accounts[0]?.toLowerCase() as Address;
  if (!user) throw new Error("Wallet not connected.");

  const escrowContract = ESCROW_ADDRESS;
  if (!escrowContract) {
    throw new Error(
      "Escrow contract address not configured. Please set NEXT_PUBLIC_AGFUSION_ESCROW_ADDRESS."
    );
  }

  const parsedAmount = parseUnits(amount, token.decimals);
  const tokenAddr = token.address.toLowerCase() as Address;
  const isNative = tokenAddr === "0x0000000000000000000000000000000000000000";

  const steps: TxStep[] = [
    { name: `Check ${token.symbol} allowance`, state: "active" },
    { name: `Deposit ${amount} ${token.symbol} into Arc Agent Escrow`, state: "pending" },
  ];
  const emit = () => onStep?.([...steps]);
  emit();

  if (!isNative) {
    const currentAllowance = await readAllowance(tokenAddr, user, escrowContract);
    if (currentAllowance < parsedAmount) {
      steps[0] = {
        name: `Approve ${token.symbol} for Escrow`,
        state: "active",
        message: "Sign approval in wallet",
      };
      emit();

      const maxUint256 = (1n << 256n) - 1n;
      const approveData = encodeApprove(escrowContract, maxUint256);
      const approveTxHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: user,
            to: tokenAddr,
            data: approveData,
          },
        ],
      })) as string;

      steps[0] = {
        name: `Approval pending`,
        state: "active",
        txHash: approveTxHash,
        message: `Confirming (${approveTxHash.slice(0, 10)}…)`,
      };
      emit();

      await arcPublicClient().waitForTransactionReceipt({
        hash: approveTxHash as `0x${string}`,
      });
    }
    steps[0] = { name: `${token.symbol} Approved`, state: "success" };
    emit();
  } else {
    steps[0] = { name: "Native USDC", state: "success" };
    emit();
  }

  // 2. Create Task Transaction
  steps[1] = {
    name: `Deposit ${amount} ${token.symbol} into Arc Escrow`,
    state: "active",
    message: "Confirm in wallet",
  };
  emit();

  const taskUri = JSON.stringify({
    title: taskTitle,
    createdAt: Date.now(),
    client: user,
    agent: agentAddress,
  });

  const txData = isNative
    ? encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "createTaskNative",
        args: [agentAddress, BigInt(durationSeconds), taskUri],
      })
    : encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "createTask",
        args: [agentAddress, tokenAddr, parsedAmount, BigInt(durationSeconds), taskUri],
      });

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: user,
        to: escrowContract,
        data: txData,
        value: isNative ? `0x${parsedAmount.toString(16)}` : "0x0",
      },
    ],
  })) as string;

  steps[1] = {
    name: "Confirming Escrow on Arc",
    state: "active",
    txHash,
    message: `Waiting for finality (${txHash.slice(0, 10)}…)`,
  };
  emit();

  const receipt = await arcPublicClient().waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  const ok = receipt.status === "success";
  steps[1] = {
    name: ok ? "Escrow Active on Arc" : "Transaction Reverted",
    state: ok ? "success" : "error",
    txHash,
  };
  emit();

  const chain: ChainId = meta.isMainnet ? "Arc" : "Arc_Testnet";

  return {
    id: uid(),
    type: "send",
    status: ok ? "success" : "error",
    amount,
    token: token.symbol,
    fromChain: chain,
    toChain: chain,
    recipient: agentAddress,
    recipientLabel: `${taskTitle} (Escrow)`,
    txHash,
    explorerUrl: explorerTxUrl(txHash, meta.chainId),
    steps,
    createdAt: new Date().toISOString(),
    executionMode: "live",
  };
}

export async function runReleaseEscrowPayment(taskId: number): Promise<string> {
  const provider = await getInjectedProvider();
  if (!provider) throw new Error("No browser wallet detected.");

  const escrowContract = ESCROW_ADDRESS;
  if (!escrowContract) throw new Error("Escrow contract not configured.");

  const accounts = await requestAccounts(provider);
  const user = accounts[0]?.toLowerCase() as Address;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "releasePayment",
    args: [BigInt(taskId)],
  });

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: user, to: escrowContract, data }],
  })) as string;

  await arcPublicClient().waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  return txHash;
}
