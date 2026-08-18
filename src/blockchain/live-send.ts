/**
 * Live USDC send on Arc Testnet via the active injected wallet.
 * Uses the wallet the user selected (Rabby / MetaMask / …) — never random window.ethereum.
 *
 * Arc-specific note:
 * USDC is the native gas asset on Arc, but user transfers should use the
 * canonical ERC-20 USDC interface. Arc's RPC has known gas-estimation/simulation
 * limitations for USDC write transactions, so this path supplies an explicit
 * gas limit instead of relying on eth_estimateGas inside the wallet.
 */

import {
  createPublicClient,
  formatEther,
  http,
  encodeFunctionData,
  parseUnits,
  type Address,
} from "viem";
import { arcTestnet, explorerTxUrl } from "@/lib/arc-chain";
import {
  getInjectedProvider,
  requestAccounts,
  switchToArcTestnet,
  type InjectedProvider,
} from "@/sdk/wallet-adapter";
import type { TransactionRecord, TxStep } from "@/types";
import { uid } from "@/lib/utils";

const ARC_USDC = "0x3600000000000000000000000000000000000000" as Address;
const USDC_DECIMALS = 6;
// Arc Testnet's RPC has documented eth_estimateGas/simulation issues for USDC
// writes. 100k is deliberately conservative for a plain ERC-20 transfer while
// remaining far below the network RPC gas cap.
const ARC_USDC_TRANSFER_GAS = 100_000n;

const ERC20_TRANSFER_ABI = [
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

export async function getLiveWalletContext(): Promise<{
  address: Address;
  provider: InjectedProvider;
} | null> {
  try {
    if (typeof window === "undefined") return null;
    const provider = await getInjectedProvider();
    const accounts = await requestAccounts(provider);
    if (!accounts[0]) return null;
    return { address: accounts[0] as Address, provider };
  } catch {
    return null;
  }
}

/** Same-origin /api/rpc proxy URL (browser) or the raw RPC (server). */
function arcRpcUrl(): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc?chain=arc`
    : arcTestnet.rpcUrls.default.http[0];
}

export async function fetchArcNativeBalance(address: Address): Promise<string> {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(arcRpcUrl()),
  });
  const bal = await client.getBalance({ address });
  return formatEther(bal);
}

export async function liveSendUsdcOnArc(params: {
  amount: string;
  recipient: string;
  recipientLabel?: string;
  onStep?: (steps: TxStep[]) => void;
  /** Optional explicit provider (preferred when caller already has Rabby) */
  provider?: InjectedProvider;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Live send must run in the browser with your connected wallet.");
  }

  const { installCircleApiProxy } = await import("@/lib/circle-proxy");
  installCircleApiProxy();

  const id = uid("tx");
  const steps: TxStep[] = [
    { name: "Connect wallet", state: "active" },
    { name: "Switch to Arc Testnet", state: "pending" },
    { name: "Sign & send USDC", state: "pending" },
    { name: "Confirm finality", state: "pending" },
  ];
  const emit = () => params.onStep?.(steps.map((s) => ({ ...s })));

  emit();

  const provider = params.provider || (await getInjectedProvider());
  const accounts = await requestAccounts(provider);
  const from = accounts[0] as Address | undefined;
  if (!from) throw new Error("No wallet account — connect Rabby or MetaMask first");

  steps[0].state = "success";
  steps[1].state = "active";
  emit();

  await switchToArcTestnet(provider);

  steps[1].state = "success";
  steps[2].state = "active";
  emit();

  const to = params.recipient as Address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error("Invalid recipient address");
  }

  const numericAmount = Number(params.amount);
  if (!params.amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Enter a valid USDC amount");
  }

  // Arc exposes USDC through two linked interfaces:
  // - native gas view: 18 decimals
  // - ERC-20 USDC view: 6 decimals
  // User transfers must use the ERC-20 USDC interface. The previous
  // implementation used a native `value` transfer, which is what triggered
  // wallet simulation/preview incompatibilities on Arc.
  const amountBaseUnits = parseUnits(params.amount, USDC_DECIMALS);
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, amountBaseUnits],
  });

  let hash: `0x${string}`;
  try {
    hash = String(
      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: ARC_USDC,
            data,
            // Explicit gas avoids Arc's unreliable eth_estimateGas path for
            // USDC writes and gives the wallet a deterministic transaction.
            gas: `0x${ARC_USDC_TRANSFER_GAS.toString(16)}`,
            value: "0x0",
          },
        ],
      }),
    ) as `0x${string}`;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (/4001|reject|denied|cancel/i.test(message)) {
      throw new Error("USDC transfer cancelled in wallet.");
    }
    throw new Error(message || "Arc USDC transfer failed.");
  }

  steps[2].state = "success";
  steps[2].txHash = hash;
  steps[3].state = "active";
  emit();

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcRpcUrl()),
  });

  let status: TransactionRecord["status"] = "success";
  let finalityMessage = "Confirmed on Arc Testnet";
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      status = "error";
      finalityMessage = "Transaction reverted on Arc Testnet";
      steps[3].state = "error";
      steps[3].message = finalityMessage;
    } else {
      steps[3].state = "success";
    }
  } catch {
    // A timeout/network failure is not proof of success. Keep the hash and mark
    // the transaction retryable so the UI never lies about on-chain finality.
    status = "retryable";
    finalityMessage = "Submitted — finality is still pending. Verify the explorer before retrying.";
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
    token: "USDC",
    fromChain: "Arc_Testnet",
    toChain: "Arc_Testnet",
    recipient: params.recipient,
    recipientLabel: params.recipientLabel,
    feeUsd: 0.04,
    steps,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash),
    createdAt: new Date().toISOString(),
    message: `Live USDC send on Arc Testnet — ${finalityMessage}`,
    executionMode: "live",
  };
}
