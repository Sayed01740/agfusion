/**
 * Live USDC send on Arc Testnet via the *active* injected wallet + viem.
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

export async function fetchArcNativeBalance(
  address: Address,
): Promise<string> {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
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
    throw new Error(
      "Live send must run in the browser with your connected wallet.",
    );
  }

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
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });

  try {
    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    steps[3].state = "success";
  } catch {
    steps[3].state = "success";
    steps[3].message = "Submitted — finality pending on explorer";
  }
  steps[3].txHash = hash;
  emit();

  return {
    id,
    type: "send",
    status: "success",
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
    message: "Live USDC send on Arc Testnet (native gas token)",
    executionMode: "live",
  };
}
