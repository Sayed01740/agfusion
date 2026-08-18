/**
 * Live USDC send on Arc Testnet via the active injected wallet + viem.
 * Uses the wallet the user selected (Rabby / MetaMask / …) — never random window.ethereum.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseEther,
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

  const walletClient = createWalletClient({
    account: from,
    chain: arcTestnet,
    transport: custom(provider as never),
  });

  const to = params.recipient as Address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error("Invalid recipient address");
  }

  // Arc's native USDC representation uses 18 decimals for native transfers.
  // The underlying balance is the same USDC balance exposed by the ERC-20
  // interface (6 decimals). This path intentionally uses a native USDC send.
  const value = parseEther(params.amount);
  const hash = await walletClient.sendTransaction({
    account: from,
    chain: arcTestnet,
    to,
    value,
  });

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
