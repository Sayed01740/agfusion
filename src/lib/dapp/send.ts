/**
 * Generic single ERC-20 transfer on Arc Testnet via the user's connected wallet.
 *
 * Mirrors the proven live-send path (src/blockchain/live-send.ts): canonical
 * ERC-20 transfer, explicit gas (Arc's eth_estimateGas is unreliable for token
 * writes), same-origin RPC for finality. Parameterized by token so it works for
 * USDC / EURC / cirBTC. The wallet remains the sole signer.
 */
import { encodeFunctionData, parseUnits, type Address } from "viem";
import { explorerTxUrl } from "@/lib/arc-chain";
import { arcPublicClient } from "@/lib/dapp/erc20";
import { isAddress, type ArcToken } from "@/lib/dapp/tokens";
import {
  getInjectedProvider,
  requestAccounts,
  switchToArcTestnet,
  type InjectedProvider,
} from "@/sdk/wallet-adapter";
import type { TransactionRecord, TxStep } from "@/types";
import { uid } from "@/lib/utils";

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TRANSFER_GAS = 100_000n;

export async function sendArcToken(params: {
  token: ArcToken;
  recipient: string;
  amount: string;
  recipientLabel?: string;
  onStep?: (steps: TxStep[]) => void;
  provider?: InjectedProvider;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Send must run in the browser with your connected wallet.");
  }

  const id = uid("tx");
  const steps: TxStep[] = [
    { name: "Connect wallet", state: "active" },
    { name: "Switch to Arc Testnet", state: "pending" },
    { name: `Sign & send ${params.token.symbol}`, state: "pending" },
    { name: "Confirm finality", state: "pending" },
  ];
  const emit = () => params.onStep?.(steps.map((s) => ({ ...s })));
  emit();

  const to = params.recipient.trim();
  if (!isAddress(to)) throw new Error("Invalid recipient address.");
  const n = Number(params.amount);
  if (!params.amount || !Number.isFinite(n) || n <= 0) throw new Error("Enter a valid amount.");

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

  const data = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [to as Address, parseUnits(params.amount.trim(), params.token.decimals)],
  });

  let hash: `0x${string}`;
  try {
    hash = String(
      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: params.token.address,
            data,
            gas: `0x${TRANSFER_GAS.toString(16)}`,
            value: "0x0",
          },
        ],
      }),
    ) as `0x${string}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/4001|reject|denied|cancel/i.test(msg)) throw new Error(`${params.token.symbol} transfer cancelled in wallet.`);
    throw new Error(msg || "Transfer failed.");
  }
  steps[2].state = "success";
  steps[2].txHash = hash;
  steps[3].state = "active";
  emit();

  const publicClient = arcPublicClient();
  let status: TransactionRecord["status"] = "success";
  let finalityMessage = "Confirmed on Arc Testnet";
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      status = "error";
      finalityMessage = "Transaction reverted on Arc Testnet";
      steps[3].state = "error";
      steps[3].message = finalityMessage;
    } else {
      steps[3].state = "success";
    }
  } catch {
    status = "retryable";
    finalityMessage = "Submitted — finality still pending. Verify the explorer before retrying.";
    steps[3].state = "pending";
    steps[3].message = finalityMessage;
  }
  steps[3].txHash = hash;
  emit();

  return {
    id,
    type: "send",
    status,
    retryable: status === "retryable",
    amount: params.amount,
    token: params.token.symbol,
    fromChain: "Arc_Testnet",
    toChain: "Arc_Testnet",
    recipient: to,
    recipientLabel: params.recipientLabel,
    feeUsd: 0.04,
    steps,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    createdAt: new Date().toISOString(),
    message: `Live ${params.token.symbol} send on Arc Testnet — ${finalityMessage}`,
    executionMode: "live",
  };
}
