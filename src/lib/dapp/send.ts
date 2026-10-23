/**
 * Generic single ERC-20 transfer on Arc (Mainnet or Testnet) via the user's
 * connected wallet.
 *
 * Dynamically detects the active Arc network (chainId 5042 = Mainnet,
 * 5042002 = Testnet) and switches accordingly before sending. The wallet
 * remains the sole signer.
 */
import { encodeFunctionData, parseUnits, type Address } from "viem";
import { explorerTxUrl, getArcNetworkMeta, IS_ARC_MAINNET } from "@/lib/arc-chain";
import { arcPublicClient } from "@/lib/dapp/erc20";
import { getToken, isAddress, type ArcToken } from "@/lib/dapp/tokens";
import {
  getChainId,
  getInjectedProvider,
  requestAccounts,
  switchToArcNetwork,
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
  walletChainId?: number;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Send must run in the browser with your connected wallet.");
  }

  const id = uid("tx");

  // ── Detect network early so we can label steps correctly ──────────────────
  const provider = params.provider || (await getInjectedProvider());
  const detectedChainId =
    params.walletChainId ?? (await getChainId(provider));
  let meta = getArcNetworkMeta(detectedChainId);
  const targetChainId = meta.isArc
    ? meta.chainId
    : (IS_ARC_MAINNET ? 5042 : 5042002);

  const steps: TxStep[] = [
    { name: "Connect wallet", state: "active" },
    { name: "Switch to Arc network", state: "pending" },
    { name: `Sign & send ${params.token.symbol}`, state: "pending" },
    { name: "Confirm finality", state: "pending" },
  ];
  const emit = () => params.onStep?.(steps.map((s) => ({ ...s })));
  emit();

  const to = params.recipient.trim();
  if (!isAddress(to)) throw new Error("Invalid recipient address.");
  const n = Number(params.amount);
  if (!params.amount || !Number.isFinite(n) || n <= 0) throw new Error("Enter a valid amount.");

  const accounts = await requestAccounts(provider);
  const from = accounts[0] as Address | undefined;
  if (!from) throw new Error("No wallet account — connect your wallet first.");
  steps[0].state = "success";
  steps[1].state = "active";
  emit();

  // Switch to an Arc network, then re-read the wallet chain before selecting
  // the network-specific token address and decimals.
  await switchToArcNetwork(provider, targetChainId as 5042 | 5042002);
  meta = getArcNetworkMeta(await getChainId(provider));
  if (!meta.isArc || meta.chainId !== targetChainId) {
    throw new Error("Wallet network could not be verified. No transfer was submitted.");
  }
  const networkToken = getToken(params.token.symbol, meta.isMainnet);
  const networkLabel = meta.isMainnet ? "Arc Mainnet" : "Arc Testnet";
  const activeChain = meta.isMainnet ? "Arc" : "Arc_Testnet";
  steps[1].name = `Switch to ${networkLabel}`;
  steps[1].state = "success";
  steps[2].name = `Sign & send ${networkToken.symbol}`;
  steps[2].state = "active";
  emit();

  const data = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [to as Address, parseUnits(params.amount.trim(), networkToken.decimals)],
  });

  let hash: `0x${string}`;
  try {
    hash = String(
      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: networkToken.address,
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

  const publicClient = arcPublicClient(meta.isMainnet);
  let status: TransactionRecord["status"] = "success";
  let finalityMessage = `Confirmed on ${networkLabel}`;
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      status = "error";
      finalityMessage = `Transaction reverted on ${networkLabel}`;
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
    token: networkToken.symbol,
    fromChain: activeChain,
    toChain: activeChain,
    recipient: to,
    recipientLabel: params.recipientLabel,
    ...(meta.isMainnet ? {} : { feeUsd: 0.04 }),
    steps,
    txHash: hash,
    explorerUrl: explorerTxUrl(hash, meta.chainId),
    createdAt: new Date().toISOString(),
    message: `Live ${params.token.symbol} send on ${networkLabel} — ${finalityMessage}`,
    executionMode: "live",
  };
}
