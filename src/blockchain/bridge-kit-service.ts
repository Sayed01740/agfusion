"use client";

/**
 * Circle CCTP v2 browser bridge using the documented Forwarding Service flow.
 *
 * The source wallet signs only approval (when needed) and depositForBurnWithHook.
 * Circle handles attestation + destination mint. Iris is asynchronous, so 404,
 * empty messages, rate limits and temporary server errors are treated as
 * transient states, never as a failed bridge. Existing burns are recoverable
 * without submitting another burn.
 */
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getCctpConfig } from "@/lib/cctp-chains";
import { explorerTxUrl } from "@/lib/arc-chain";
import { uid } from "@/lib/utils";
import { getInjectedProvider, getChainId, switchToChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { attachBridgeProviderDiagnostics, recordBridgeDebug } from "@/lib/bridge-debug";
import { encodeFunctionData, decodeFunctionResult, pad } from "viem";
import { verifyReceiptOnChain } from "@/lib/tx-verify";

const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
const FORWARDING_HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;
const IRIS_PROXY = "/api/circle/iris";
// Iris indexing/forwarding is asynchronous. Keep the browser flow alive long
// enough for normal testnet latency, while returning a recoverable record if
// the user has to leave the page before settlement appears.
const IRIS_MAX_POLLS = 240; // 20 minutes at 5 seconds
const IRIS_POLL_MS = 5000;
const IRIS_INITIAL_DELAY_MS = 5000;
const USDC_DECIMALS = 6;

type Eip1193 = { request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown> };
type FeeRow = { finalityThreshold?: number; minimumFee?: number; forwardFee?: { low?: number; med?: number; high?: number } };
type IrisMessage = { status?: string; forwardTxHash?: string; eventNonce?: string; transactionHash?: string; attestation?: string; forwardState?: string };
type IrisTransient = { __transient: true; status: number; body: unknown };

const ALLOWANCE_ABI = [{ type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const APPROVE_ABI = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }] as const;
const BURN_ABI = [{ type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [
  { name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" },
  { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" },
  { name: "minFinalityThreshold", type: "uint32" }, { name: "hookData", type: "bytes" },
], outputs: [] }] as const;

function toUnits(amount: string): bigint {
  const value = String(amount || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error("Bridge amount must be a valid USDC amount.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}
function assertAddress(value: string): asserts value is `0x${string}` { if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("Bridge recipient must be a valid EVM address."); }
function step(name: string, state: TxStep["state"], txHash?: string, message?: string): TxStep { return { name, state, txHash, message }; }
async function rpc(provider: Eip1193, method: string, params: unknown[] = []): Promise<any> { return provider.request({ method, params }); }
async function sleep(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitReceipt(provider: Eip1193, txHash: string, timeoutMs = 120_000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await rpc(provider, "eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    await sleep(1500);
  }
  throw new Error(`Transaction ${txHash} was not confirmed within ${Math.round(timeoutMs / 1000)} seconds.`);
}

/**
 * Fetch Iris. For the message polling endpoint, 404/429/5xx are normal
 * transient conditions while Iris indexes or forwards a newly-burned message.
 * Fee lookup remains fail-closed because a missing fee quote is not a polling
 * condition.
 */
async function irisGet(path: string, options: { allowTransient?: boolean } = {}): Promise<any | IrisTransient> {
  const response = await fetch(`${IRIS_PROXY}?path=${encodeURIComponent(path)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!response.ok) {
    const transient = options.allowTransient && (response.status === 404 || response.status === 429 || response.status >= 500);
    if (transient) return { __transient: true, status: response.status, body: json };
    throw new Error(`Circle Iris ${response.status}: ${JSON.stringify(json).slice(0, 1200)}`);
  }
  return json;
}

async function getFees(sourceDomain: number, destinationDomain: number, debugId: string) {
  recordBridgeDebug("cctp.fees.request", { sourceDomain, destinationDomain, forward: true }, debugId, "Requesting live Circle forwarding fee");
  const response = await irisGet(`/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}?forward=true`);
  const rows: FeeRow[] = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
  if (!rows.length) throw new Error(`Circle returned no forwarding fee quote for ${sourceDomain} → ${destinationDomain}.`);
  const selected = rows.find((row) => Number(row.finalityThreshold) === 1000) || rows[0];
  const forwardFeeValue = selected.forwardFee?.med ?? selected.forwardFee?.high ?? selected.forwardFee?.low;
  if (forwardFeeValue == null) throw new Error("Circle fee response did not include forwardFee.");
  const forwardFee = BigInt(Math.ceil(Number(forwardFeeValue)));
  const protocolFee = BigInt(Math.ceil(Number(selected.minimumFee || 0) * 100));
  const maxFee = forwardFee + protocolFee;
  const finalityThreshold = Number(selected.finalityThreshold || 1000);
  recordBridgeDebug("cctp.fees.response", { selected, forwardFee: forwardFee.toString(), protocolFee: protocolFee.toString(), maxFee: maxFee.toString(), finalityThreshold }, debugId, "Circle forwarding fee received");
  return { forwardFee, protocolFee, maxFee, finalityThreshold };
}

async function sendTx(provider: Eip1193, from: string, to: string, data: string, debugId: string, stage: string): Promise<string> {
  recordBridgeDebug(`${stage}.request`, { from, to, data }, debugId, `Submitting ${stage}`);
  const hash = String(await rpc(provider, "eth_sendTransaction", [{ from, to, data }]));
  recordBridgeDebug(`${stage}.submitted`, { txHash: hash }, debugId, `${stage} submitted`, { method: "eth_sendTransaction" });
  return hash;
}

async function waitForwardedMint(sourceDomain: number, burnTx: string, destinationChain: ChainId, recipient: string, amount: string, debugId: string): Promise<string | null> {
  recordBridgeDebug("cctp.iris.poll.start", { sourceDomain, burnTx, destinationChain, recipient, maxPolls: IRIS_MAX_POLLS, intervalMs: IRIS_POLL_MS, initialDelayMs: IRIS_INITIAL_DELAY_MS }, debugId, "Waiting for Circle Iris forwardTxHash; 404 is treated as transient");
  // Do not query immediately after the source receipt. Iris may need time to
  // index the MessageSent event. This also prevents hammering the API.
  await sleep(IRIS_INITIAL_DELAY_MS);

  for (let attempt = 1; attempt <= IRIS_MAX_POLLS; attempt++) {
    let response: any | IrisTransient;
    try {
      response = await irisGet(`/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTx)}`, { allowTransient: true });
    } catch (error) {
      recordBridgeDebug("cctp.iris.poll.error", { attempt, error: error instanceof Error ? error.message : String(error) }, debugId, `Iris polling request failed at attempt ${attempt}; retrying` , { error });
      await sleep(IRIS_POLL_MS);
      continue;
    }

    if (response && response.__transient) {
      recordBridgeDebug("cctp.iris.poll.transient", { attempt, httpStatus: response.status, body: response.body }, debugId, `Circle Iris returned transient HTTP ${response.status}; continuing to poll`);
      await sleep(IRIS_POLL_MS);
      continue;
    }

    const messages: IrisMessage[] = Array.isArray(response?.messages) ? response.messages : [];
    const message = messages.find((candidate) => String(candidate?.transactionHash || "").toLowerCase() === burnTx.toLowerCase()) || messages[0];
    recordBridgeDebug("cctp.iris.poll.response", { attempt, messageCount: messages.length, status: message?.status, forwardState: message?.forwardState, forwardTxHash: message?.forwardTxHash, eventNonce: message?.eventNonce, transactionHash: message?.transactionHash, hasAttestation: Boolean(message?.attestation) }, debugId, `Circle Iris poll ${attempt}/${IRIS_MAX_POLLS}`);

    if (message?.forwardTxHash) {
      const mintTx = String(message.forwardTxHash);
      const destinationConfig = getCctpConfig(destinationChain);
      if (!destinationConfig) throw new Error(`Missing destination configuration for ${destinationChain}.`);
      const verified = await verifyReceiptOnChain({ chainKey: destinationConfig.rpcProxyKey, txHash: mintTx, attempts: 5, delayMs: 1200 });
      recordBridgeDebug("cctp.destination.receipt.check", { attempt, mintTx, status: verified.status, destinationChain }, debugId, `Checked Circle forwarded destination receipt: ${verified.status}`);
      if (verified.status === "success") {
        recordBridgeDebug("cctp.destination.receipt.confirmed", { mintTx, destinationChain, recipient, amount }, debugId, "Destination mint receipt confirmed");
        recordBridgeDebug("cctp.iris.forwarded.confirmed", { burnTx, mintTx }, debugId, "Circle Forwarding Service confirmed destination mint");
        return mintTx;
      }
      if (verified.status === "reverted") throw new Error(`Circle returned forwardTxHash ${mintTx}, but the destination transaction reverted.`);
      // pending/not_found means the hash exists in Iris before the destination
      // RPC can see its receipt. Keep polling instead of declaring failure.
      await sleep(IRIS_POLL_MS);
      continue;
    }

    if (message?.status && /failed|error|rejected/i.test(message.status)) {
      throw new Error(`Circle Iris reported permanent forwarding status ${message.status}.`);
    }
    await sleep(IRIS_POLL_MS);
  }

  recordBridgeDebug("cctp.iris.poll.timeout", { burnTx, sourceDomain, destinationChain, maxPolls: IRIS_MAX_POLLS, intervalMs: IRIS_POLL_MS }, debugId, "Iris did not expose a destination mint within the polling window; source burn remains recoverable");
  return null;
}

export async function runBridgeKitFlow(params: { amount: string; fromChain: ChainId; toChain: ChainId; txId?: string; recipient?: string; failedResult?: unknown }): Promise<TransactionRecord> {
  const debugId = params.txId || uid("bridge");
  const source = getCctpConfig(params.fromChain);
  const destination = getCctpConfig(params.toChain);
  if (!source || !destination) throw new Error("Selected chains are not configured for CCTP v2.");
  if (params.fromChain === params.toChain) throw new Error("Source and destination must be different chains.");
  if (!EVM_CHAIN_PARAMS[params.fromChain]) throw new Error(`Unsupported EVM source chain ${params.fromChain}.`);

  const provider = await getInjectedProvider();
  attachBridgeProviderDiagnostics(provider, "cctp-v2-forwarder", debugId);
  const meta = getActiveWalletMeta();
  const accounts = (await rpc(provider, "eth_accounts")) as string[];
  const address = String(accounts?.[0] || meta?.address || "");
  assertAddress(address);
  const recipient = params.recipient || address;
  assertAddress(recipient);

  await switchToChainId(provider, params.fromChain);
  const actualChain = await getChainId(provider);
  if (actualChain !== source.chainId) throw new Error(`Wallet is on chain ${actualChain}; expected ${source.chainId} for ${params.fromChain}.`);

  recordBridgeDebug("cctp.flow.start", { amount: params.amount, source: params.fromChain, destination: params.toChain, sourceDomain: source.domain, destinationDomain: destination.domain, wallet: address, recipient, architecture: "direct-CCTP-v2-forwarding-hook" }, debugId, "Starting direct Circle CCTP v2 Forwarding Service flow");

  const transferAmount = toUnits(params.amount);
  const fees = await getFees(source.domain, destination.domain, debugId);
  const totalAmount = transferAmount + fees.maxFee;
  recordBridgeDebug("cctp.amounts.calculated", { transferAmount: transferAmount.toString(), forwardFee: fees.forwardFee.toString(), protocolFee: fees.protocolFee.toString(), maxFee: fees.maxFee.toString(), totalAmount: totalAmount.toString() }, debugId, "Calculated transfer amount plus forwarding fees");

  const allowanceData = encodeFunctionData({ abi: ALLOWANCE_ABI, functionName: "allowance", args: [address, TOKEN_MESSENGER_V2] });
  const allowanceRaw = await rpc(provider, "eth_call", [{ to: source.usdc, data: allowanceData }, "latest"]);
  const allowance = BigInt(decodeFunctionResult({ abi: ALLOWANCE_ABI, functionName: "allowance", data: allowanceRaw }) as unknown as bigint);
  recordBridgeDebug("cctp.allowance", { allowance: allowance.toString(), required: totalAmount.toString(), usdc: source.usdc, tokenMessenger: TOKEN_MESSENGER_V2 }, debugId, "Read USDC allowance");

  const steps: TxStep[] = [];
  let approvalTx: string | undefined;
  if (allowance < totalAmount) {
    const approveData = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [TOKEN_MESSENGER_V2, totalAmount] });
    approvalTx = await sendTx(provider, address, source.usdc, approveData, debugId, "cctp.approval");
    steps.push(step("USDC Approval", "pending", approvalTx));
    const receipt = await waitReceipt(provider, approvalTx);
    if (String(receipt?.status).toLowerCase() !== "0x1") throw new Error(`USDC approval failed: ${approvalTx}`);
    steps[steps.length - 1] = step("USDC Approval", "success", approvalTx, "USDC approval confirmed.");
    recordBridgeDebug("cctp.approval.confirmed", { approvalTx }, debugId, "USDC approval confirmed");
  } else {
    steps.push(step("USDC Approval", "success", undefined, "Existing allowance covers the bridge amount and fees."));
    recordBridgeDebug("cctp.approval.skipped", { allowance: allowance.toString() }, debugId, "Approval signature skipped because allowance is sufficient");
  }

  const burnData = encodeFunctionData({
    abi: BURN_ABI,
    functionName: "depositForBurnWithHook",
    args: [totalAmount, destination.domain, pad(recipient as `0x${string}`, { size: 32 }), source.usdc, pad("0x", { size: 32 }), fees.maxFee, fees.finalityThreshold, FORWARDING_HOOK],
  });
  const burnTx = await sendTx(provider, address, TOKEN_MESSENGER_V2, burnData, debugId, "cctp.burn");
  steps.push(step("CCTP Burn + Forwarding Hook", "pending", burnTx, `Burning ${totalAmount.toString()} USDC base units with Circle forwarding hook.`));
  const burnReceipt = await waitReceipt(provider, burnTx);
  if (String(burnReceipt?.status).toLowerCase() !== "0x1") throw new Error(`CCTP burn failed: ${burnTx}`);
  steps[steps.length - 1] = step("CCTP Burn + Forwarding Hook", "success", burnTx, "Source burn confirmed with cctp-forward hook data.");
  recordBridgeDebug("cctp.burn.confirmed", { burnTx }, debugId, "CCTP burn confirmed");

  const mintTx = await waitForwardedMint(source.domain, burnTx, params.toChain, recipient, params.amount, debugId);
  if (!mintTx) {
    const pendingMessage = `Source burn ${burnTx} is confirmed. Circle Iris has not returned a destination mint yet; this bridge is recoverable and no second burn is required.`;
    steps.push(step("Destination Mint via Circle Forwarding Service", "pending", undefined, pendingMessage));
    return {
      id: params.txId || debugId,
      type: "bridge",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient,
      feeUsd: Number(fees.maxFee) / 1_000_000,
      steps,
      txHash: burnTx,
      explorerUrl: explorerTxUrl(burnTx),
      createdAt: new Date().toISOString(),
      message: pendingMessage,
      executionMode: "live",
      bridgeResult: { burnTxHash: burnTx, forwardTxHash: undefined, approvalTxHash: approvalTx, sourceDomain: source.domain, destinationDomain: destination.domain, maxFee: fees.maxFee.toString(), forwardingFee: fees.forwardFee.toString(), protocolFee: fees.protocolFee.toString(), hookData: FORWARDING_HOOK, settlementPending: true },
    };
  }
  steps.push(step("Destination Mint via Circle Forwarding Service", "success", mintTx, "Circle Iris returned forwardTxHash and destination receipt was confirmed."));

  return {
    id: params.txId || debugId,
    type: "bridge",
    status: "success",
    retryable: false,
    amount: params.amount,
    token: "USDC",
    fromChain: params.fromChain,
    toChain: params.toChain,
    recipient,
    feeUsd: Number(fees.maxFee) / 1_000_000,
    steps,
    txHash: mintTx,
    explorerUrl: explorerTxUrl(mintTx),
    createdAt: new Date().toISOString(),
    message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}. Source burn ${burnTx} confirmed; Circle Forwarding Service destination mint ${mintTx} confirmed.`,
    executionMode: "live",
    bridgeResult: { burnTxHash: burnTx, forwardTxHash: mintTx, approvalTxHash: approvalTx, sourceDomain: source.domain, destinationDomain: destination.domain, maxFee: fees.maxFee.toString(), forwardingFee: fees.forwardFee.toString(), protocolFee: fees.protocolFee.toString(), hookData: FORWARDING_HOOK },
  };
}

export async function runBridgeKitRecovery(params: { amount: string; fromChain: ChainId; toChain: ChainId; recipient?: string; failedTx?: TransactionRecord | null; txId?: string }): Promise<TransactionRecord> {
  const existing = params.failedTx?.bridgeResult as any;
  const burnTx = existing?.burnTxHash;
  const source = getCctpConfig(params.fromChain);
  const recipient = params.recipient || params.failedTx?.recipient;
  if (burnTx && source && recipient) {
    assertAddress(recipient);
    const debugId = params.txId || params.failedTx?.id || uid("bridge-recovery");
    recordBridgeDebug("cctp.recovery.existing-burn", { burnTx, sourceDomain: source.domain, destinationChain: params.toChain, recipient }, debugId, "Recovering existing confirmed CCTP burn without reburning");
    const mintTx = await waitForwardedMint(source.domain, burnTx, params.toChain, recipient, params.amount, debugId);
    if (!mintTx) {
      const pendingMessage = `Existing source burn ${burnTx} is confirmed, but Circle Iris has not returned the destination mint yet. No new burn was submitted.`;
      return { ...(params.failedTx as TransactionRecord), id: debugId, status: "retryable", retryable: true, txHash: burnTx, explorerUrl: explorerTxUrl(burnTx), steps: [...(params.failedTx?.steps || []), step("Destination Mint via Circle Forwarding Service", "pending", undefined, pendingMessage)], message: pendingMessage, bridgeResult: { ...(params.failedTx?.bridgeResult as any), burnTxHash: burnTx, settlementPending: true } };
    }
    return { ...(params.failedTx as TransactionRecord), id: debugId, status: "success", retryable: false, txHash: mintTx, explorerUrl: explorerTxUrl(mintTx), steps: [...(params.failedTx?.steps || []), step("Destination Mint via Circle Forwarding Service", "success", mintTx, "Recovered existing CCTP burn through Circle Iris.")], message: `Recovered existing burn ${burnTx}; destination mint ${mintTx} confirmed.`, bridgeResult: { ...(params.failedTx?.bridgeResult as any), burnTxHash: burnTx, forwardTxHash: mintTx, settlementPending: false } };
  }
  return runBridgeKitFlow({ amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient, txId: params.txId });
}
