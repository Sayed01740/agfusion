/**
 * Circle Email Wallet bridge path.
 *
 * Circle Email Wallets are hosted user-controlled wallets. For Arc Testnet ↔
 * Base Sepolia we use Circle CCTP Forwarding Service so the wallet signs only
 * the source-chain approval and burn. Circle performs the destination mint.
 *
 * Important invariants:
 * - IRIS testnet calls always go through the same-origin server proxy.
 * - A confirmed burn is never submitted again.
 * - A challenge is never duplicated while its transaction resource is pending.
 * - Destination success requires a real forwarded mint hash and a confirmed
 *   destination receipt.
 */

import { encodeFunctionData, pad, parseUnits } from "viem";
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CIRCLE_BRIDGE_CHAINS, getCctpConfig } from "@/lib/cctp-chains";
import { uid, sleep } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/arc-chain";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { getCircleSdk, getCircleSession } from "@/sdk/circle-pw";
import {
  initBridgeState,
  loadBridgeState,
  saveBridgeState,
  type BridgeState,
} from "@/lib/bridge-state";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const IRIS_PROXY = "/api/circle/iris";
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

type CircleTransactionResult = {
  txHash: string;
  challengeId: string;
  walletId: string;
};

function irisProxyUrl(path: string): string {
  return `${IRIS_PROXY}?path=${encodeURIComponent(path)}`;
}

async function irisGet<T>(path: string): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(irisProxyUrl(path), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as T | null;
  return { response, data };
}

async function getForwardingFeeQuote(sourceDomain: number, destinationDomain: number): Promise<FeeQuote> {
  const { response, data } = await irisGet<FeeQuote[]>(
    `/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}?forward=true`,
  );
  if (!response.ok) {
    throw new Error(
      `Circle Forwarding Service fee quote failed (HTTP ${response.status}).`,
    );
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Circle returned no forwarding fee quote for this route.");
  }

  // Prefer Fast Transfer when the route exposes a forwarding fee. If it does
  // not, use Standard Transfer. Circle's fee API is the source of truth and is
  // queried immediately before a new burn.
  const selected =
    data.find((fee) => fee.finalityThreshold === 1000 && fee.forwardFee?.med != null) ||
    data.find((fee) => fee.finalityThreshold === 2000 && fee.forwardFee?.med != null) ||
    data.find((fee) => fee.forwardFee?.med != null);

  if (!selected) {
    throw new Error("Circle Forwarding Service is not available for this route.");
  }
  return selected;
}

function calculateForwardingAmounts(amount: bigint, fee: FeeQuote) {
  const forwardFee = BigInt(fee.forwardFee?.med ?? 0);
  const protocolFee =
    (amount * BigInt(Math.round((fee.minimumFee || 0) * 100))) /
    BigInt(1_000_000);
  const maxFee = forwardFee + protocolFee;
  const totalAmount = amount + maxFee;
  return { maxFee, totalAmount };
}

async function executeCircleContractTransactionReliable(params: {
  chainId: number;
  to: string;
  data: string;
  value?: string;
}): Promise<CircleTransactionResult> {
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

    if (attempt < maxAttempts - 1) await sleep(pollDelayMs);
  }

  const suffix = transactionId ? ` Transaction id: ${transactionId}.` : "";
  throw new Error(
    `Circle approved the transaction, but the blockchain transaction hash is still pending after 5 minutes.${suffix} The transaction was not re-submitted; check Circle wallet activity before retrying.`,
  );
}

async function verifyExistingSourceTx(
  chainKey: string,
  txHash: string,
  label: string,
): Promise<"confirmed" | "pending"> {
  const receipt = await verifyReceiptOnChain({
    chainKey,
    txHash,
    attempts: 10,
    delayMs: 2_000,
  });
  if (receipt.status === "reverted") {
    throw new Error(`${label} transaction reverted on-chain. No replacement transaction was submitted.`);
  }
  if (receipt.status === "success") return "confirmed";
  return "pending";
}

async function waitForForwardedMint(
  sourceDomain: number,
  burnTxHash: string,
  timeoutMs = 20 * 60 * 1000,
): Promise<string> {
  const started = Date.now();
  const path = `/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTxHash)}`;

  while (Date.now() - started < timeoutMs) {
    try {
      const { response, data } = await irisGet<{
        messages?: Array<{
          status?: string;
          forwardState?: string;
          forwardTxHash?: string;
        }>;
      }>(path);

      if (response.ok) {
        const message = data?.messages?.[0];
        if (message?.forwardTxHash && /^0x[a-fA-F0-9]{64}$/.test(message.forwardTxHash)) {
          return message.forwardTxHash;
        }
      }
    } catch {
      // IRIS is eventually consistent. Keep polling through transient failures.
    }
    await sleep(5_000);
  }

  throw new Error(
    `Burn ${burnTxHash.slice(0, 18)}… is confirmed, but Circle has not returned the forwarded destination mint within 20 minutes. The burn was not repeated. Check Circle activity before retrying.`,
  );
}

function assertExistingStateMatches(
  state: BridgeState,
  params: {
    amount: string;
    fromChain: ChainId;
    toChain: ChainId;
    recipient: string;
    walletAddress: string;
  },
): void {
  if (
    state.walletType !== "circle" ||
    state.walletAddress?.toLowerCase() !== params.walletAddress.toLowerCase() ||
    state.fromChain !== params.fromChain ||
    state.toChain !== params.toChain ||
    state.amount !== params.amount ||
    (state.recipient || params.walletAddress).toLowerCase() !== params.recipient.toLowerCase()
  ) {
    throw new Error(
      "This bridge session belongs to a different Circle wallet, route, amount, or recipient. Start a new bridge instead of reusing it.",
    );
  }
}

function completedRecord(
  state: BridgeState,
  destination: NonNullable<ReturnType<typeof getCctpConfig>>,
): TransactionRecord | null {
  if (state.state !== "COMPLETED" || !state.destinationTxHash) return null;
  return {
    id: state.txId,
    type: "bridge",
    status: "success",
    retryable: false,
    amount: state.amount,
    token: state.token,
    fromChain: state.fromChain,
    toChain: state.toChain,
    recipient: state.recipient,
    feeUsd: 0,
    steps: [
      { name: "Approval", state: "success", txHash: state.approvalTxHash },
      { name: "Burn", state: "success", txHash: state.burnTxHash },
      { name: "Attestation / Forwarding", state: "success" },
      { name: "Destination Mint", state: "success", txHash: state.destinationTxHash },
    ],
    txHash: state.destinationTxHash,
    explorerUrl: destination.explorerUrl.includes("basescan")
      ? `https://sepolia.basescan.org/tx/${state.destinationTxHash}`
      : explorerTxUrl(state.destinationTxHash),
    createdAt: new Date(state.createdAt).toISOString(),
    message: "Bridge already completed. No transaction was re-submitted.",
    executionMode: "live",
    bridgeState: state,
  };
}

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
  const recipient = params.recipient || address || "";
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Circle Email Wallet address is unavailable. Reconnect the wallet and retry.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    throw new Error("Bridge recipient must be a valid EVM address.");
  }

  const source = getCctpConfig(params.fromChain);
  const destination = getCctpConfig(params.toChain);
  if (!source || !destination) {
    throw new Error("CCTP configuration missing for the selected bridge route.");
  }

  const amount = parseUnits(params.amount, 6);
  if (amount <= BigInt(0)) throw new Error("Enter a valid USDC bridge amount.");

  const txId = params.txId ?? uid("tx");
  const persisted = params.txId ? loadBridgeState(params.txId) : null;
  let state: BridgeState;

  if (persisted) {
    assertExistingStateMatches(persisted, {
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient,
      walletAddress: address,
    });
    state = persisted;
  } else {
    state = initBridgeState({
      txId,
      walletType: "circle",
      walletAddress: address,
      fromChain: params.fromChain,
      toChain: params.toChain,
      token: "USDC",
      amount: params.amount,
      recipient,
    });
  }

  const alreadyCompleted = completedRecord(state, destination);
  if (alreadyCompleted) return alreadyCompleted;

  const steps: TxStep[] = [
    { name: "Approval", state: state.approvalTxHash ? "success" : "pending", txHash: state.approvalTxHash },
    { name: "Burn", state: state.burnTxHash ? "success" : "pending", txHash: state.burnTxHash },
    { name: "Attestation / Forwarding", state: state.destinationTxHash ? "success" : "pending" },
    { name: "Destination Mint", state: state.destinationTxHash ? "success" : "pending", txHash: state.destinationTxHash },
  ];

  try {
    let maxFee = BigInt(0);
    let totalAmount = amount;

    // A prior burn is immutable. From this point forward we do not need a new
    // fee quote and must not create another approval/burn transaction.
    if (state.burnTxHash) {
      const burnStatus = await verifyExistingSourceTx(source.rpcProxyKey, state.burnTxHash, "Burn");
      if (burnStatus !== "confirmed") {
        throw new Error(`Burn ${state.burnTxHash} is still pending. AGFusion will not submit another burn.`);
      }
      steps[1] = { name: "Burn", state: "success", txHash: state.burnTxHash };
    } else {
      const feeQuote = await getForwardingFeeQuote(source.domain, destination.domain);
      const calculated = calculateForwardingAmounts(amount, feeQuote);
      maxFee = calculated.maxFee;
      totalAmount = calculated.totalAmount;

      const mintRecipient = pad(recipient as `0x${string}`, { size: 32 });
      const destinationCaller = pad("0x", { size: 32 });

      if (state.approvalTxHash) {
        const approvalStatus = await verifyExistingSourceTx(source.rpcProxyKey, state.approvalTxHash, "Approval");
        if (approvalStatus !== "confirmed") {
          throw new Error(`Approval ${state.approvalTxHash} is still pending. AGFusion will not submit a duplicate approval.`);
        }
        steps[0] = { name: "Approval", state: "success", txHash: state.approvalTxHash };
      } else {
        state = { ...state, state: "APPROVAL_PENDING", updatedAt: Date.now() };
        saveBridgeState(state);
        steps[0] = { name: "Approval", state: "active" };

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

        state = {
          ...state,
          approvalTxHash: approval.txHash,
          state: "APPROVED",
          updatedAt: Date.now(),
        };
        saveBridgeState(state);
        steps[0] = { name: "Approval", state: "success", txHash: approval.txHash };
      }

      state = { ...state, state: "BURN_PENDING", updatedAt: Date.now() };
      saveBridgeState(state);
      steps[1] = { name: "Burn", state: "active" };

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

      state = {
        ...state,
        burnTxHash: burn.txHash,
        state: "BURN_CONFIRMED",
        updatedAt: Date.now(),
      };
      saveBridgeState(state);
      steps[1] = { name: "Burn", state: "success", txHash: burn.txHash };
    }

    // The source receipt is authoritative. Challenge completion alone is not.
    const burnHash = state.burnTxHash as string;
    const burnStatus = await verifyExistingSourceTx(source.rpcProxyKey, burnHash, "Burn");
    if (burnStatus !== "confirmed") {
      throw new Error(`Burn ${burnHash} is still pending. AGFusion will not re-burn.`);
    }

    if (!state.destinationTxHash) {
      state = { ...state, state: "ATTESTATION_PENDING", updatedAt: Date.now() };
      saveBridgeState(state);
      steps[2] = { name: "Attestation / Forwarding", state: "active" };

      const destinationTxHash = await waitForForwardedMint(source.domain, burnHash);
      state = {
        ...state,
        destinationTxHash,
        state: "DESTINATION_PENDING",
        updatedAt: Date.now(),
      };
      saveBridgeState(state);
      steps[2] = { name: "Attestation / Forwarding", state: "success" };
      steps[3] = { name: "Destination Mint", state: "active", txHash: destinationTxHash };
    }

    const destinationTxHash = state.destinationTxHash as string;
    const destinationReceipt = await verifyReceiptOnChain({
      chainKey: destination.rpcProxyKey,
      txHash: destinationTxHash,
      attempts: 20,
      delayMs: 2_000,
    });
    if (destinationReceipt.status === "reverted") {
      throw new Error(`Destination mint transaction reverted on ${params.toChain.replace(/_/g, " ")}.`);
    }
    if (destinationReceipt.status !== "success") {
      throw new Error(`Destination mint ${destinationTxHash} is not confirmed yet. The source burn will not be repeated.`);
    }

    state = {
      ...state,
      state: "COMPLETED",
      updatedAt: Date.now(),
    };
    saveBridgeState(state);
    steps[2] = { name: "Attestation / Forwarding", state: "success" };
    steps[3] = { name: "Destination Mint", state: "success", txHash: destinationTxHash };

    return {
      id: txId,
      type: "bridge",
      status: "success",
      retryable: false,
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient,
      feeUsd: Number(maxFee) / 1_000_000,
      steps,
      txHash: destinationTxHash,
      explorerUrl: destination.explorerUrl.includes("basescan")
        ? `https://sepolia.basescan.org/tx/${destinationTxHash}`
        : explorerTxUrl(destinationTxHash),
      createdAt: new Date(state.createdAt).toISOString(),
      message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain} via Circle Forwarding Service. Source burn: ${burnHash}`,
      executionMode: "live",
      bridgeState: state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = {
      ...state,
      state: state.burnTxHash ? "RECOVERABLE" : "FAILED",
      error: message,
      updatedAt: Date.now(),
    };
    saveBridgeState(state);
    throw error instanceof Error ? error : new Error(message);
  }
}
