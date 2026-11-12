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
import { uid, shortenAddress } from "@/lib/utils";
import { getInjectedProvider, getChainId, switchToChainId, EVM_CHAIN_PARAMS } from "@/sdk/wallet-adapter";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { attachBridgeProviderDiagnostics, recordBridgeDebug } from "@/lib/bridge-debug";
import { encodeFunctionData, decodeFunctionResult, formatUnits, getAddress, pad } from "viem";
import { verifyReceiptOnChain } from "@/lib/tx-verify";
import {
  updateBridgeState,
  loadBridgeState,
  initBridgeState,
  bridgeStateToSteps,
  type BridgeStateName,
  type BridgeState,
} from "@/lib/bridge-state";
import { usePilotStore } from "@/store/pilot-store";

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

const BALANCE_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const ALLOWANCE_ABI = [{ type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const APPROVE_ABI = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }] as const;
const BURN_WITH_HOOK_ABI = [{ type: "function", name: "depositForBurnWithHook", stateMutability: "nonpayable", inputs: [
  { name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" },
  { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" },
  { name: "minFinalityThreshold", type: "uint32" }, { name: "hookData", type: "bytes" },
], outputs: [] }] as const;

const BURN_DIRECT_ABI = [{ type: "function", name: "depositForBurn", stateMutability: "nonpayable", inputs: [
  { name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" },
  { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" },
  { name: "minFinalityThreshold", type: "uint32" },
], outputs: [] }] as const;

const RECEIVE_MESSAGE_ABI = [{ type: "function", name: "receiveMessage", stateMutability: "nonpayable", inputs: [
  { name: "message", type: "bytes" }, { name: "attestation", type: "bytes" },
], outputs: [{ name: "success", type: "bool" }] }] as const;

function isTestnetChain(chain: ChainId | string | number | undefined | null): boolean {
  if (!chain) return false;
  const s = String(chain).toLowerCase();
  return (
    s.includes("testnet") ||
    s.includes("sepolia") ||
    s.includes("fuji") ||
    s.includes("amoy") ||
    s === "5042002" ||
    s === "84532" ||
    s === "11155111" ||
    s === "421614" ||
    s === "43113" ||
    s === "80002" ||
    s === "11155420"
  );
}

function notifyBridgeStep(
  txId: string | undefined,
  stateName: BridgeStateName,
  data?: {
    approvalTxHash?: string;
    burnTxHash?: string;
    destinationTxHash?: string;
    message?: string;
  },
) {
  if (!txId) return;
  try {
    const patch: Partial<BridgeState> = { state: stateName };
    if (data?.approvalTxHash) patch.approvalTxHash = data.approvalTxHash;
    if (data?.burnTxHash) patch.burnTxHash = data.burnTxHash;
    if (data?.destinationTxHash) patch.destinationTxHash = data.destinationTxHash;

    const current = updateBridgeState(txId, patch) || loadBridgeState(txId);
    if (current) {
      const steps = bridgeStateToSteps(current);
      const primaryHash = data?.destinationTxHash || data?.burnTxHash || data?.approvalTxHash;
      usePilotStore.getState().updateTransaction(txId, {
        steps,
        txHash: primaryHash,
        explorerUrl: primaryHash ? explorerTxUrl(primaryHash) : undefined,
        message: data?.message,
        bridgeState: current,
      });
    }
  } catch (err) {
    console.warn("[BridgeKit] notifyBridgeStep error:", err);
  }
}

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
async function irisGet(path: string, options: { allowTransient?: boolean; isSandbox?: boolean } = {}): Promise<any | IrisTransient> {
  const sandboxParam = options.isSandbox ? "&sandbox=true" : "&sandbox=false";
  const response = await fetch(`${IRIS_PROXY}?path=${encodeURIComponent(path)}${sandboxParam}`, { headers: { Accept: "application/json" }, cache: "no-store" });
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

async function getFees(
  sourceDomain: number,
  destinationDomain: number,
  debugId: string,
  isSandbox = false,
  mode: "fast-direct" | "auto-relayer" = "fast-direct",
) {
  if (mode === "fast-direct") {
    // Option 1: Fast Direct CCTP (0.00 USDC relayer fee · User self-mints on destination)
    recordBridgeDebug("cctp.fees.request", { sourceDomain, destinationDomain, forward: false, isSandbox, mode }, debugId, "Requesting direct CCTP burn fee (no forwarder)");
    let response: any;
    try {
      response = await irisGet(`/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`, { isSandbox });
    } catch (e) {
      recordBridgeDebug("cctp.fees.direct.fallback", { error: String(e) }, debugId, "Direct fee endpoint returned fallback, defaulting to zero protocol fee");
      response = [{ finalityThreshold: 1000, minimumFee: 0 }];
    }
    const rows: FeeRow[] = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
    const selected = rows.find((row) => Number(row.finalityThreshold) === 1000) || rows[0] || { finalityThreshold: 1000, minimumFee: 0 };
    const forwardFee = 0n; // Zero relayer fee!
    const protocolFee = BigInt(Math.ceil(Number(selected.minimumFee || 0) * 100));
    const maxFee = protocolFee;
    const finalityThreshold = Number(selected.finalityThreshold || 1000);
    recordBridgeDebug("cctp.fees.response", { selected, forwardFee: "0", protocolFee: protocolFee.toString(), maxFee: maxFee.toString(), finalityThreshold, mode: "fast-direct" }, debugId, "Circle direct CCTP fee received (0.00 USDC bridge fee)");
    return { forwardFee, protocolFee, maxFee, finalityThreshold, mode };
  }

  // Option 2: Auto-Relayer Mode (Use 'low' fee tier for minimal gasless destination mint fee)
  recordBridgeDebug("cctp.fees.request", { sourceDomain, destinationDomain, forward: true, isSandbox, mode }, debugId, "Requesting Circle forwarding fee with lowest tier");
  const response = await irisGet(`/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}?forward=true`, { isSandbox });
  const rows: FeeRow[] = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
  if (!rows.length) throw new Error(`Circle returned no forwarding fee quote for ${sourceDomain} → ${destinationDomain}.`);
  const selected = rows.find((row) => Number(row.finalityThreshold) === 1000) || rows[0];
  // Option 2: prefer lowest fee tier ('low') first, then med, then high
  const forwardFeeValue = selected.forwardFee?.low ?? selected.forwardFee?.med ?? selected.forwardFee?.high;
  if (forwardFeeValue == null) throw new Error("Circle fee response did not include forwardFee.");
  const forwardFee = BigInt(Math.ceil(Number(forwardFeeValue)));
  const protocolFee = BigInt(Math.ceil(Number(selected.minimumFee || 0) * 100));
  const maxFee = forwardFee + protocolFee;
  const finalityThreshold = Number(selected.finalityThreshold || 1000);
  recordBridgeDebug("cctp.fees.response", { selected, forwardFee: forwardFee.toString(), protocolFee: protocolFee.toString(), maxFee: maxFee.toString(), finalityThreshold, mode: "auto-relayer", tier: "low" }, debugId, "Circle forwarding fee received (low tier)");
  return { forwardFee, protocolFee, maxFee, finalityThreshold, mode };
}

async function sendTx(provider: Eip1193, from: string, to: string, data: string, debugId: string, stage: string): Promise<string> {
  recordBridgeDebug(`${stage}.request`, { from, to, data }, debugId, `Submitting ${stage}`);
  let chainId: number | null = null;
  try {
    const rawChain = await rpc(provider, "eth_chainId");
    chainId = Number.parseInt(String(rawChain), 16);
  } catch {}
  const txPayload: Record<string, unknown> = { from, to, data };
  if (chainId === 5042002 || chainId === 5042) {
    txPayload.gas = stage.includes("burn") ? "0x7a120" : "0x30d40";
  }
  const hash = String(await rpc(provider, "eth_sendTransaction", [txPayload]));
  recordBridgeDebug(`${stage}.submitted`, { txHash: hash }, debugId, `${stage} submitted`, { method: "eth_sendTransaction" });
  return hash;
}

async function waitForwardedMint(
  sourceDomain: number,
  burnTx: string,
  destinationChain: ChainId,
  recipient: string,
  amount: string,
  debugId: string,
  txId?: string,
  approvalTx?: string,
  isSandbox = false,
): Promise<string | null> {
  recordBridgeDebug("cctp.iris.poll.start", { sourceDomain, burnTx, destinationChain, recipient, maxPolls: IRIS_MAX_POLLS, intervalMs: IRIS_POLL_MS, initialDelayMs: IRIS_INITIAL_DELAY_MS, isSandbox }, debugId, "Waiting for Circle Iris forwardTxHash; 404 is treated as transient");
  // Do not query immediately after the source receipt. Iris may need time to
  // index the MessageSent event. This also prevents hammering the API.
  await sleep(IRIS_INITIAL_DELAY_MS);

  for (let attempt = 1; attempt <= IRIS_MAX_POLLS; attempt++) {
    let response: any | IrisTransient;
    try {
      response = await irisGet(`/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTx)}`, { allowTransient: true, isSandbox });
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

    if (message?.attestation && !message?.forwardTxHash) {
      notifyBridgeStep(txId, "ATTESTATION_RECEIVED", {
        approvalTxHash: approvalTx,
        burnTxHash: burnTx,
        message: "Attestation received. Waiting for Circle relayer to mint on destination...",
      });
    }

    if (message?.forwardTxHash) {
      const mintTx = String(message.forwardTxHash);
      notifyBridgeStep(txId, "DESTINATION_PENDING", {
        approvalTxHash: approvalTx,
        burnTxHash: burnTx,
        destinationTxHash: mintTx,
        message: `Circle Forwarding Service submitted mint: ${shortenAddress(mintTx)}`,
      });
      const destinationConfig = getCctpConfig(destinationChain);
      if (!destinationConfig) throw new Error(`Missing destination configuration for ${destinationChain}.`);
      const verified = await verifyReceiptOnChain({ chainKey: destinationConfig.rpcProxyKey, txHash: mintTx, attempts: 5, delayMs: 1200 });
      recordBridgeDebug("cctp.destination.receipt.check", { attempt, mintTx, status: verified.status, destinationChain }, debugId, `Checked Circle forwarded destination receipt: ${verified.status}`);
      if (verified.status === "success") {
        recordBridgeDebug("cctp.destination.receipt.confirmed", { mintTx, destinationChain, recipient, amount }, debugId, "Destination mint receipt confirmed");
        recordBridgeDebug("cctp.iris.forwarded.confirmed", { burnTx, mintTx }, debugId, "Circle Forwarding Service confirmed destination mint");
        notifyBridgeStep(txId, "COMPLETED", {
          approvalTxHash: approvalTx,
          burnTxHash: burnTx,
          destinationTxHash: mintTx,
          message: "Destination mint confirmed!",
        });
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

type IrisDirectMessage = { message?: string; attestation?: string; status?: string; transactionHash?: string };

async function waitDirectAttestation(
  sourceDomain: number,
  burnTx: string,
  debugId: string,
  txId?: string,
  approvalTx?: string,
  isSandbox = false,
): Promise<{ message: `0x${string}`; attestation: `0x${string}` } | null> {
  recordBridgeDebug("cctp.iris.attestation.start", { sourceDomain, burnTx, isSandbox }, debugId, "Waiting for Circle Iris message & attestation for direct claim");
  await sleep(IRIS_INITIAL_DELAY_MS);

  for (let attempt = 1; attempt <= IRIS_MAX_POLLS; attempt++) {
    let response: any | IrisTransient;
    try {
      response = await irisGet(`/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTx)}`, { allowTransient: true, isSandbox });
    } catch (error) {
      recordBridgeDebug("cctp.iris.attestation.error", { attempt, error: error instanceof Error ? error.message : String(error) }, debugId, `Iris polling error at attempt ${attempt}`);
      await sleep(IRIS_POLL_MS);
      continue;
    }

    if (response && response.__transient) {
      await sleep(IRIS_POLL_MS);
      continue;
    }

    const messages: IrisDirectMessage[] = Array.isArray(response?.messages) ? response.messages : [];
    const msg = messages.find((m) => String(m?.transactionHash || "").toLowerCase() === burnTx.toLowerCase()) || messages[0];

    if (msg?.message && msg?.attestation && msg.attestation.startsWith("0x") && msg.attestation !== "PENDING") {
      recordBridgeDebug("cctp.iris.attestation.success", { attempt, hasMessage: true, hasAttestation: true }, debugId, "Received Circle Iris message and attestation for direct mint");
      notifyBridgeStep(txId, "ATTESTATION_RECEIVED", {
        approvalTxHash: approvalTx,
        burnTxHash: burnTx,
        message: "Attestation received! Ready to mint USDC on destination chain.",
      });
      return {
        message: msg.message as `0x${string}`,
        attestation: msg.attestation as `0x${string}`,
      };
    }

    notifyBridgeStep(txId, "ATTESTATION_PENDING", {
      approvalTxHash: approvalTx,
      burnTxHash: burnTx,
      message: `Waiting for Circle Iris attestation (attempt ${attempt}/${IRIS_MAX_POLLS})...`,
    });
    await sleep(IRIS_POLL_MS);
  }

  return null;
}

export async function runBridgeKitFlow(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  txId?: string;
  recipient?: string;
  bridgeMode?: "fast-direct" | "auto-relayer";
  failedResult?: unknown;
}): Promise<TransactionRecord> {
  const debugId = params.txId || uid("bridge");
  const bridgeMode = params.bridgeMode || "fast-direct";
  const source = getCctpConfig(params.fromChain);
  const destination = getCctpConfig(params.toChain);
  if (!source || !destination) throw new Error("Selected chains are not configured for CCTP v2.");
  if (params.fromChain === params.toChain) throw new Error("Source and destination must be different chains.");
  if (!EVM_CHAIN_PARAMS[params.fromChain]) throw new Error(`Unsupported EVM source chain ${params.fromChain}.`);

  const isSandbox = isTestnetChain(params.fromChain) || isTestnetChain(params.toChain);

  const provider = await getInjectedProvider();
  attachBridgeProviderDiagnostics(provider, `cctp-v2-${bridgeMode}`, debugId);
  const meta = getActiveWalletMeta();
  const accounts = (await rpc(provider, "eth_accounts")) as string[];
  const rawAddress = String(accounts?.[0] || meta?.address || "").trim();
  assertAddress(rawAddress);
  const address = getAddress(rawAddress.toLowerCase());
  const rawRecipient = (params.recipient || address).trim();
  assertAddress(rawRecipient);
  const recipient = getAddress(rawRecipient.toLowerCase());
  const sourceUsdc = getAddress(source.usdc.toLowerCase());
  const tokenMessenger = getAddress(source.tokenMessenger.toLowerCase());

  // Initialize bridge state if not already present
  let existingState = loadBridgeState(debugId);
  if (!existingState) {
    existingState = initBridgeState({
      txId: debugId,
      walletType: "evm",
      walletAddress: address,
      fromChain: params.fromChain,
      toChain: params.toChain,
      token: "USDC",
      amount: params.amount,
      recipient,
    });
  }

  await switchToChainId(provider, params.fromChain);
  const actualChain = await getChainId(provider);
  if (actualChain !== source.chainId) throw new Error(`Wallet is on chain ${actualChain}; expected ${source.chainId} for ${params.fromChain}.`);

  recordBridgeDebug("cctp.flow.start", { amount: params.amount, source: params.fromChain, destination: params.toChain, sourceDomain: source.domain, destinationDomain: destination.domain, wallet: address, recipient, isSandbox, bridgeMode }, debugId, `Starting Circle CCTP v2 flow (${bridgeMode})`);

  const transferAmount = toUnits(params.amount);
  const fees = await getFees(source.domain, destination.domain, debugId, isSandbox, bridgeMode);
  const totalAmount = transferAmount + fees.maxFee;
  recordBridgeDebug("cctp.amounts.calculated", { transferAmount: transferAmount.toString(), forwardFee: fees.forwardFee.toString(), protocolFee: fees.protocolFee.toString(), maxFee: fees.maxFee.toString(), totalAmount: totalAmount.toString(), bridgeMode }, debugId, "Calculated transfer amount and fees");

  const balanceData = encodeFunctionData({ abi: BALANCE_ABI, functionName: "balanceOf", args: [address] });
  const balanceRaw = await rpc(provider, "eth_call", [{ to: sourceUsdc, data: balanceData }, "latest"]);
  const usdcBalance = BigInt(decodeFunctionResult({ abi: BALANCE_ABI, functionName: "balanceOf", data: balanceRaw }) as unknown as bigint);
  if (usdcBalance < totalAmount) {
    const feeDescription = bridgeMode === "fast-direct" ? "0.00 USDC direct burn" : `${formatUnits(fees.maxFee, USDC_DECIMALS)} USDC relayer fee`;
    throw new Error(
      `Insufficient USDC for bridge. Available: ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC; required: ${formatUnits(totalAmount, USDC_DECIMALS)} USDC (${params.amount} USDC transfer + ${feeDescription}).`,
    );
  }

  const allowanceData = encodeFunctionData({ abi: ALLOWANCE_ABI, functionName: "allowance", args: [address, tokenMessenger] });
  const allowanceRaw = await rpc(provider, "eth_call", [{ to: sourceUsdc, data: allowanceData }, "latest"]);
  const allowance = BigInt(decodeFunctionResult({ abi: ALLOWANCE_ABI, functionName: "allowance", data: allowanceRaw }) as unknown as bigint);
  recordBridgeDebug("cctp.allowance", { allowance: allowance.toString(), required: totalAmount.toString(), usdc: sourceUsdc, tokenMessenger }, debugId, "Read USDC allowance");

  let approvalTx: string | undefined;
  if (allowance < totalAmount) {
    notifyBridgeStep(debugId, "APPROVAL_PENDING", { message: "Approve USDC spending in your wallet..." });
    const approveData = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [tokenMessenger, totalAmount] });
    approvalTx = await sendTx(provider, address, sourceUsdc, approveData, debugId, "cctp.approval");
    notifyBridgeStep(debugId, "APPROVAL_PENDING", { approvalTxHash: approvalTx, message: `USDC approval submitted: ${shortenAddress(approvalTx)}` });
    const receipt = await waitReceipt(provider, approvalTx);
    if (String(receipt?.status).toLowerCase() !== "0x1") throw new Error(`USDC approval failed: ${approvalTx}`);
    notifyBridgeStep(debugId, "APPROVED", { approvalTxHash: approvalTx, message: "USDC approval confirmed." });
    recordBridgeDebug("cctp.approval.confirmed", { approvalTx }, debugId, "USDC approval confirmed");
  } else {
    notifyBridgeStep(debugId, "APPROVED", { message: "Existing allowance covers the bridge amount." });
    recordBridgeDebug("cctp.approval.skipped", { allowance: allowance.toString() }, debugId, "Approval signature skipped because allowance is sufficient");
  }

  notifyBridgeStep(debugId, "BURN_PENDING", { approvalTxHash: approvalTx, message: "Sign CCTP burn transaction in your wallet..." });

  let burnData: string;
  if (bridgeMode === "auto-relayer") {
    // Option 2: Forwarding hook with lowest tier forwardFee
    burnData = encodeFunctionData({
      abi: BURN_WITH_HOOK_ABI,
      functionName: "depositForBurnWithHook",
      args: [totalAmount, destination.domain, pad(recipient, { size: 32 }), sourceUsdc, pad("0x", { size: 32 }), fees.maxFee, fees.finalityThreshold, FORWARDING_HOOK],
    });
  } else {
    // Option 1: Fast Direct CCTP (0.00 USDC Fee)
    burnData = encodeFunctionData({
      abi: BURN_DIRECT_ABI,
      functionName: "depositForBurn",
      args: [totalAmount, destination.domain, pad(recipient, { size: 32 }), sourceUsdc, pad("0x", { size: 32 }), fees.maxFee, fees.finalityThreshold],
    });
  }

  const burnTx = await sendTx(provider, address, tokenMessenger, burnData, debugId, "cctp.burn");
  notifyBridgeStep(debugId, "BURN_PENDING", { approvalTxHash: approvalTx, burnTxHash: burnTx, message: `CCTP burn submitted: ${shortenAddress(burnTx)}` });
  const burnReceipt = await waitReceipt(provider, burnTx);
  if (String(burnReceipt?.status).toLowerCase() !== "0x1") throw new Error(`CCTP burn failed: ${burnTx}`);
  notifyBridgeStep(debugId, "BURN_CONFIRMED", { approvalTxHash: approvalTx, burnTxHash: burnTx, message: `Source burn confirmed (${bridgeMode === "fast-direct" ? "Zero fee direct burn" : "Forwarding relayer burn"}).` });
  recordBridgeDebug("cctp.burn.confirmed", { burnTx, bridgeMode }, debugId, "CCTP burn confirmed");

  notifyBridgeStep(debugId, "ATTESTATION_PENDING", { approvalTxHash: approvalTx, burnTxHash: burnTx, message: "Waiting for Circle Iris attestation..." });

  let mintTx: string | null = null;
  if (bridgeMode === "auto-relayer") {
    // Option 2: Circle relayer mints gaslessly on destination
    mintTx = await waitForwardedMint(source.domain, burnTx, params.toChain, recipient, params.amount, debugId, debugId, approvalTx, isSandbox);
  } else {
    // Option 1: Zero-Fee Direct CCTP — wait for Iris attestation, switch to destination chain, and call receiveMessage!
    const attestationResult = await waitDirectAttestation(source.domain, burnTx, debugId, debugId, approvalTx, isSandbox);
    if (attestationResult) {
      notifyBridgeStep(debugId, "DESTINATION_PENDING", {
        approvalTxHash: approvalTx,
        burnTxHash: burnTx,
        message: `Please switch wallet to ${params.toChain.replace(/_/g, " ")} to mint your USDC (0.00 Circle fee)...`,
      });

      try {
        await switchToChainId(provider, params.toChain);
        const destMessageTransmitter = getAddress(destination.messageTransmitter.toLowerCase());
        const receiveData = encodeFunctionData({
          abi: RECEIVE_MESSAGE_ABI,
          functionName: "receiveMessage",
          args: [attestationResult.message, attestationResult.attestation],
        });

        mintTx = await sendTx(provider, address, destMessageTransmitter, receiveData, debugId, "cctp.receiveMessage");
        notifyBridgeStep(debugId, "DESTINATION_PENDING", {
          approvalTxHash: approvalTx,
          burnTxHash: burnTx,
          destinationTxHash: mintTx,
          message: `Destination mint submitted: ${shortenAddress(mintTx)}`,
        });

        const mintReceipt = await waitReceipt(provider, mintTx);
        if (String(mintReceipt?.status).toLowerCase() !== "0x1") throw new Error(`Destination receiveMessage failed: ${mintTx}`);

        notifyBridgeStep(debugId, "COMPLETED", {
          approvalTxHash: approvalTx,
          burnTxHash: burnTx,
          destinationTxHash: mintTx,
          message: "Destination mint confirmed! USDC credited.",
        });
      } catch (destErr) {
        recordBridgeDebug("cctp.destination.mint.error", { error: String(destErr) }, debugId, "Destination receiveMessage error, marked as recoverable");
      }
    }
  }

  const finalBridgeState = loadBridgeState(debugId);
  const steps = finalBridgeState ? bridgeStateToSteps(finalBridgeState) : [
    step("Approval", "success", approvalTx),
    step("Burn", "success", burnTx),
    step("Attestation", mintTx ? "success" : "pending"),
    step("Destination Mint", mintTx ? "success" : "pending", mintTx || undefined),
  ];

  if (!mintTx) {
    notifyBridgeStep(debugId, "RECOVERABLE", { approvalTxHash: approvalTx, burnTxHash: burnTx, message: `Source burn confirmed (${shortenAddress(burnTx)}). Circle Iris settlement is in progress in the background.` });
    const pendingMessage = `Source burn ${burnTx} is confirmed. Circle Iris has not returned a destination mint yet; this bridge is recoverable and no second burn is required.`;
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
      bridgeState: finalBridgeState ?? undefined,
    };
  }

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
    bridgeState: finalBridgeState ?? undefined,
  };
}

export async function runBridgeKitRecovery(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  failedTx?: TransactionRecord | null;
  txId?: string;
  bridgeMode?: "fast-direct" | "auto-relayer";
}): Promise<TransactionRecord> {
  const existing = params.failedTx?.bridgeResult as any;
  const burnTx = existing?.burnTxHash;
  const source = getCctpConfig(params.fromChain);
  const destination = getCctpConfig(params.toChain);
  const recipient = params.recipient || params.failedTx?.recipient;
  if (burnTx && source && destination && recipient) {
    assertAddress(recipient);
    const debugId = params.txId || params.failedTx?.id || uid("bridge-recovery");
    const isSandbox = isTestnetChain(params.fromChain) || isTestnetChain(params.toChain);
    recordBridgeDebug("cctp.recovery.existing-burn", { burnTx, sourceDomain: source.domain, destinationChain: params.toChain, recipient, isSandbox }, debugId, "Recovering existing confirmed CCTP burn without reburning");
    notifyBridgeStep(debugId, "ATTESTATION_PENDING", { approvalTxHash: existing?.approvalTxHash, burnTxHash: burnTx, message: "Checking Circle Iris for existing burn settlement..." });

    let mintTx: string | null = null;
    const provider = await getInjectedProvider();
    const meta = getActiveWalletMeta();
    const accounts = (await rpc(provider, "eth_accounts")) as string[];
    const address = getAddress(String(accounts?.[0] || meta?.address || "").trim().toLowerCase());

    // Check direct attestation first or forwarded mint
    const attestation = await waitDirectAttestation(source.domain, burnTx, debugId, debugId, existing?.approvalTxHash, isSandbox);
    if (attestation) {
      try {
        await switchToChainId(provider, params.toChain);
        const destMessageTransmitter = getAddress(destination.messageTransmitter.toLowerCase());
        const receiveData = encodeFunctionData({
          abi: RECEIVE_MESSAGE_ABI,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
        });
        mintTx = await sendTx(provider, address, destMessageTransmitter, receiveData, debugId, "cctp.receiveMessage.recovery");
        const receipt = await waitReceipt(provider, mintTx);
        if (String(receipt?.status).toLowerCase() === "0x1") {
          notifyBridgeStep(debugId, "COMPLETED", { approvalTxHash: existing?.approvalTxHash, burnTxHash: burnTx, destinationTxHash: mintTx, message: "Recovered and completed destination mint!" });
        }
      } catch (err) {
        recordBridgeDebug("cctp.recovery.direct.failed", { error: String(err) }, debugId, "Direct receiveMessage during recovery failed, checking relayer mint");
      }
    }

    if (!mintTx) {
      mintTx = await waitForwardedMint(source.domain, burnTx, params.toChain, recipient, params.amount, debugId, debugId, existing?.approvalTxHash, isSandbox);
    }

    const finalBridgeState = loadBridgeState(debugId);
    const steps = finalBridgeState ? bridgeStateToSteps(finalBridgeState) : (params.failedTx?.steps || []);
    if (!mintTx) {
      const pendingMessage = `Existing source burn ${burnTx} is confirmed, but Circle Iris has not returned the destination mint yet. No new burn was submitted.`;
      return { ...(params.failedTx as TransactionRecord), id: debugId, status: "retryable", retryable: true, txHash: burnTx, explorerUrl: explorerTxUrl(burnTx), steps, message: pendingMessage, bridgeResult: { ...(params.failedTx?.bridgeResult as any), burnTxHash: burnTx, settlementPending: true }, bridgeState: finalBridgeState ?? undefined };
    }
    return { ...(params.failedTx as TransactionRecord), id: debugId, status: "success", retryable: false, txHash: mintTx, explorerUrl: explorerTxUrl(mintTx), steps, message: `Recovered existing burn ${burnTx}; destination mint ${mintTx} confirmed.`, bridgeResult: { ...(params.failedTx?.bridgeResult as any), burnTxHash: burnTx, forwardTxHash: mintTx, settlementPending: false }, bridgeState: finalBridgeState ?? undefined };
  }
  return runBridgeKitFlow({ amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient, txId: params.txId, bridgeMode: params.bridgeMode });
}
