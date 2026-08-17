/**
 * Circle Email Wallet bridge path.
 *
 * Circle Email Wallets are user-controlled wallets backed by the Circle Web SDK.
 * They do not behave like a normal browser EIP-1193 signer during App Kit's
 * cross-chain lifecycle. For Arc <-> Base, use CCTP's Forwarding Service instead:
 * the Circle wallet signs only the source-chain approve + burn transactions and
 * Circle handles destination minting. This avoids destination-chain wallet
 * switching and the opaque App Kit "Network connection failed" failure.
 */

import { encodeFunctionData, pad, parseUnits } from "viem";
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS, getCctpConfig } from "@/lib/cctp-chains";
import { uid, sleep } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/arc-chain";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { getCircleSdk, getCircleSession } from "@/sdk/circle-pw";
import { initBridgeState, saveBridgeState } from "@/lib/bridge-state";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const IRIS_API = "https://iris-api-sandbox.circle.com";
const FORWARDING_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as `0x${string}`;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TOKEN_MESSENGER_V2_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

type FeeQuote = {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee?: { med?: number };
};

async function getForwardingFeeQuote(sourceDomain: number, destinationDomain: number): Promise<FeeQuote> {
  const url = `${IRIS_API}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}?forward=true`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Circle Forwarding Service fee quote failed (HTTP ${response.status}).`);
  }
  const fees = (await response.json()) as FeeQuote[];
  if (!Array.isArray(fees) || fees.length === 0) {
    throw new Error("Circle returned no forwarding fee quote for this route.");
  }

  // Arc Testnet is a standard-transfer source, so prefer the standard quote.
  // For routes that expose Fast Transfer, prefer 1000. Otherwise use 2000.
  const selected =
    fees.find((fee) => fee.finalityThreshold === 1000 && fee.forwardFee?.med != null) ||
    fees.find((fee) => fee.finalityThreshold === 2000 && fee.forwardFee?.med != null) ||
    fees.find((fee) => fee.forwardFee?.med != null);

  if (!selected) {
    throw new Error("Circle Forwarding Service is not available for this route.");
  }
  return selected;
}

function calculateForwardingAmounts(amount: bigint, fee: FeeQuote) {
  const forwardFee = BigInt(fee.forwardFee?.med ?? 0);
  // Circle documents minimumFee in basis points. Convert bps to USDC subunits.
  const protocolFee =
    (amount * BigInt(Math.round((fee.minimumFee || 0) * 100))) / BigInt(1_000_000);
  const maxFee = forwardFee + protocolFee;
  const totalAmount = amount + maxFee;
  return { maxFee, totalAmount };
}

/**
 * Execute one Circle contract challenge without treating PIN approval as a
 * transaction submission. Circle documents user-controlled-wallet
 * transactions as asynchronous: after approval the transaction can remain
 * INITIATED/QUEUED/CLEARED before a txHash exists. The previous helper stopped
 * after 30 seconds, which caused the exact UI error shown by the user even
 * though Circle had accepted the challenge.
 *
 * This bridge-specific resolver waits up to 5 minutes and, once Circle exposes
 * the exact transaction id, polls that transaction directly. It never creates
 * a second challenge while the first one is still being resolved.
 */
async function executeCircleContractTransactionReliable(params: {
  chainId: number;
  to: string;
  data: string;
  value?: string;
}): Promise<{ txHash: string; challengeId: string; walletId: string }> {
  const session = getCircleSession();
  if (!session) {
    throw new Error("Circle wallet session expired. Reconnect your Circle Email Wallet.");
  }

  const blockchain =
    params.chainId === 5042002
      ? "ARC-TESTNET"
      : params.chainId === 84532
        ? "BASE-SEPOLIA"
        : null;
  if (!blockchain) {
    throw new Error("Circle Email Wallet can only execute on Arc Testnet and Base Sepolia.");
  }

  const wallet = session.wallets.find((item) => item.blockchain === blockchain);
  if (!wallet) {
    throw new Error(`Create or reconnect a Circle ${blockchain} wallet before bridging.`);
  }

  const preparedAt = Date.now();
  const response = await fetch("/api/circle/pw/contract-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userToken: session.userToken,
      walletId: wallet.id,
      contractAddress: params.to,
      callData: params.data,
      value: params.value,
      chainId: params.chainId,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.challengeId) {
    throw new Error(result?.error || "Circle could not prepare this bridge step.");
  }

  const challengeId = String(result.challengeId);
  const sdk = await getCircleSdk();
  await new Promise<void>((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error(error.message || "Circle approval was cancelled."));
      else resolve();
    });
  });

  let transactionId: string | undefined;
  const maxAttempts = 200;
  const pollDelayMs = 1_500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const lookupResponse = await fetch("/api/circle/pw/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: session.userToken,
        walletId: wallet.id,
        challengeId,
        transactionId,
        since: preparedAt,
      }),
      cache: "no-store",
    });
    const lookup = await lookupResponse.json().catch(() => null);

    if (lookupResponse.ok && lookup?.txHash) {
      return {
        txHash: String(lookup.txHash),
        challengeId,
        walletId: wallet.id,
      };
    }

    if (lookup?.transactionId && typeof lookup.transactionId === "string") {
      transactionId = lookup.transactionId;
    }

    if (
      lookupResponse.status === 422 ||
      lookup?.challengeStatus === "FAILED" ||
      lookup?.challengeStatus === "EXPIRED"
    ) {
      throw new Error(lookup?.message || lookup?.error || "Circle transaction failed.");
    }

    // Keep polling through INITIATED/QUEUED/CLEARED/SENT. Circle's documented
    // transaction lifecycle is asynchronous and txHash is assigned at SENT.
    if (attempt < maxAttempts - 1) await sleep(pollDelayMs);
  }

  const suffix = transactionId ? ` Transaction id: ${transactionId}.` : "";
  throw new Error(
    `Circle approved the transaction, but the blockchain transaction hash is still pending after 5 minutes.${suffix} The transaction was not re-submitted; check Circle wallet activity before retrying.`,
  );
}

async function waitForForwardedMint(
  sourceDomain: number,
  burnTxHash: string,
  timeoutMs = 20 * 60 * 1000,
): Promise<string> {
  const started = Date.now();
  const url = `${IRIS_API}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          messages?: Array<{
            status?: string;
            forwardTxHash?: string;
            message?: string;
          }>;
        };
        const message = data.messages?.[0];
        if (message?.forwardTxHash) return message.forwardTxHash;
      }
    } catch {
      // Temporary Iris connectivity failure. Keep polling with backoff.
    }
    await sleep(5_000);
  }

  throw new Error(
    `Burn ${burnTxHash.slice(0, 18)}… is confirmed, but Circle has not returned the forwarded destination mint within 20 minutes. Check Circle activity and retry status; AGFusion will not re-burn.`,
  );
}

/**
 * Execute Arc <-> Base for Circle Email Wallet using CCTP Forwarding Service.
 * No destination wallet signature is requested.
 */
export async function runCircleEmailWalletForwardingBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  txId?: string;
}): Promise<TransactionRecord> {
  if (typeof window === "undefined") {
    throw new Error("Circle Email Wallet bridge must run in the browser.");
  }
  if (!CIRCLE_BRIDGE_CHAINS.includes(params.fromChain) || !CIRCLE_BRIDGE_CHAINS.includes(params.toChain)) {
    throw new Error("Circle Email Wallet supports only Arc Testnet ↔ Base Sepolia bridging.");
  }
  if (params.fromChain === params.toChain) {
    throw new Error("Source and destination must be different chains.");
  }

  const meta = getActiveWalletMeta();
  if (meta?.uuid !== "circle-pw") {
    throw new Error("Circle Email Wallet forwarding path requires the active Circle Email Wallet.");
  }
  const address = meta.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Circle Email Wallet address is unavailable. Reconnect the wallet and retry.");
  }

  const source = getCctpConfig(params.fromChain);
  const destination = getCctpConfig(params.toChain);
  if (!source || !destination) throw new Error("CCTP configuration missing for the selected bridge route.");

  const amount = parseUnits(params.amount, 6);
  if (amount <= BigInt(0)) throw new Error("Enter a valid USDC bridge amount.");

  const txId = params.txId ?? uid("tx");
  let state = initBridgeState({
    txId,
    walletType: "circle",
    walletAddress: address,
    fromChain: params.fromChain,
    toChain: params.toChain,
    token: "USDC",
    amount: params.amount,
    recipient: params.recipient || address,
  });

  const steps: TxStep[] = [
    { name: "Approval", state: "active" },
    { name: "Burn", state: "pending" },
    { name: "Attestation / Forwarding", state: "pending" },
    { name: "Destination Mint", state: "pending" },
  ];

  try {
    const feeQuote = await getForwardingFeeQuote(source.domain, destination.domain);
    const { maxFee, totalAmount } = calculateForwardingAmounts(amount, feeQuote);
    const mintRecipient = pad((params.recipient || address) as `0x${string}`, { size: 32 });
    const destinationCaller = pad("0x", { size: 32 });

    const approvalData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [source.tokenMessenger, totalAmount],
    });

    const approval = await executeCircleContractTransactionReliable({
      chainId: source.chainId,
      to: source.usdc,
      data: approvalData,
    });

    steps[0] = { name: "Approval", state: "success", txHash: approval.txHash };
    state = {
      ...state,
      approvalTxHash: approval.txHash,
      state: "APPROVED",
      updatedAt: Date.now(),
    };
    saveBridgeState(state);

    steps[1].state = "active";
    const burnData = encodeFunctionData({
      abi: TOKEN_MESSENGER_V2_ABI,
      functionName: "depositForBurnWithHook",
      args: [
        totalAmount,
        destination.domain,
        mintRecipient,
        source.usdc,
        destinationCaller,
        maxFee,
        feeQuote.finalityThreshold,
        FORWARDING_HOOK_DATA,
      ],
    });

    const burn = await executeCircleContractTransactionReliable({
      chainId: source.chainId,
      to: source.tokenMessenger,
      data: burnData,
    });

    steps[1] = { name: "Burn", state: "success", txHash: burn.txHash };
    state = {
      ...state,
      burnTxHash: burn.txHash,
      state: "BURN_CONFIRMED",
      updatedAt: Date.now(),
    };
    saveBridgeState(state);

    // The source receipt is authoritative. Never treat Circle challenge success as burn success.
    const burnReceipt = await verifyReceiptOnChain({
      chainKey: source.rpcProxyKey,
      txHash: burn.txHash,
      attempts: 10,
      delayMs: 2_000,
    });
    if (burnReceipt.status === "reverted") {
      throw new Error(`Burn transaction reverted on ${params.fromChain.replace(/_/g, " ")}.`);
    }
    if (burnReceipt.status !== "success") {
      throw new Error(`Burn transaction ${burn.txHash} is not confirmed yet. Do not retry the burn.`);
    }

    steps[2].state = "active";
    state = { ...state, state: "ATTESTATION_PENDING", updatedAt: Date.now() };
    saveBridgeState(state);

    // Forwarding Service performs the destination receive/mint transaction.
    const destinationTxHash = await waitForForwardedMint(source.domain, burn.txHash);
    steps[2] = { name: "Attestation / Forwarding", state: "success" };
    steps[3] = { name: "Destination Mint", state: "success", txHash: destinationTxHash };

    state = {
      ...state,
      destinationTxHash,
      state: "COMPLETED",
      updatedAt: Date.now(),
    };
    saveBridgeState(state);

    return {
      id: txId,
      type: "bridge",
      status: "success",
      retryable: false,
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient: params.recipient || address,
      feeUsd: Number(maxFee) / 1_000_000,
      steps,
      txHash: destinationTxHash,
      explorerUrl:
        destination.explorerUrl.includes("basescan")
          ? `https://sepolia.basescan.org/tx/${destinationTxHash}`
          : explorerTxUrl(destinationTxHash),
      createdAt: new Date().toISOString(),
      message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain} via Circle Forwarding Service. Source burn: ${burn.txHash}`,
      executionMode: "live",
      bridgeState: state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = { ...state, state: state.burnTxHash ? "RECOVERABLE" : "FAILED", error: message, updatedAt: Date.now() };
    saveBridgeState(state);
    throw error instanceof Error ? error : new Error(message);
  }
}
