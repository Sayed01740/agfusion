"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { encodeFunctionData, maxUint256, parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { executeSwap } from "@/lib/client-actions";
import { getArcDexSwapQuote, normalizeSlippageBps } from "@/blockchain/production-swap";
import { explorerTxUrl, getArcNetworkMeta } from "@/lib/arc-chain";
import { arcPublicClient, readAllowance } from "@/lib/dapp/erc20";
import { getToken } from "@/lib/dapp/tokens";
import { ARC_PERMIT2_CONTRACT } from "@/blockchain/uniswap-permit2";
import { getChainId, getInjectedProvider } from "@/sdk/wallet-adapter";
import { assertArcMainnetWalletState } from "@/blockchain/uniswap-mainnet-adapter";
import { uid } from "@/lib/utils";

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

type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];
const SLIPPAGE_PRESETS = ["0.5", "1", "1.5", "2", "3"];
type SwapQuote = {
  amountOut?: string;
  minimumAmountOut?: string;
  route?: string;
  network?: "mainnet" | "testnet";
  quoteSession?: string;
  quoteSessionExpiresAt?: number;
  permitData?: Record<string, unknown> | null;
  estimatedGasUsd?: string | null;
};

type PreparedMainnetTransaction = {
  executionEnabled: boolean;
  receiptVerificationTicket?: string;
  transaction: {
    chainId: number;
    from: string;
    to: string;
    data: string;
    value: string;
    gasLimit: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };
  validation?: {
    estimatedGas?: string;
    estimatedGasCost?: string;
    minimumAmountOut?: string;
    commandNames?: string[];
  };
};

type PendingApprovalTransaction = {
  chainId: number;
  from: string;
  to: string;
  data: string;
  value: string;
  spender: string;
  amount: string;
};

function prettyAmount(value?: string) {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function parseSlippageBps(value: string): number {
  return normalizeSlippageBps(Number(value) * 100);
}

function minimumReceived(amountOut: string, slippage: string): string {
  const out = Number(amountOut);
  const pct = Number(slippage);
  if (!Number.isFinite(out) || !Number.isFinite(pct)) return "—";
  return (out * (1 - pct / 100)).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function getVerifiedMainnetProvider(expectedAddress: string) {
  const provider = await getInjectedProvider();
  const [chainId, rawAccounts] = await Promise.all([
    getChainId(provider),
    provider.request({ method: "eth_accounts" }),
  ]);
  const account = Array.isArray(rawAccounts) && typeof rawAccounts[0] === "string"
    ? rawAccounts[0]
    : null;
  assertArcMainnetWalletState({ chainId, account, expectedAccount: expectedAddress });
  return { provider, account: account as string };
}

export function ProductionSwapPanel() {
  const { addTransaction, setActiveTx, setThinking, walletAddress, walletChainId } = usePilotStore();
  const meta = getArcNetworkMeta(walletChainId);

  const [tokenIn, setTokenIn] = useState<ArcSwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<ArcSwapToken>("EURC");
  const [amount, setAmount] = useState("0.50");
  const [slippage, setSlippage] = useState("1");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [prepared, setPrepared] = useState<PreparedMainnetTransaction | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalTransaction | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const [needsTokenApproval, setNeedsTokenApproval] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"exact" | "unlimited">("exact");
  const [flowStep, setFlowStep] = useState<"idle" | "approving" | "signing" | "preparing" | "broadcasting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setQuote(null);
    setPrepared(null);
    setPendingApproval(null);
    setNeedsTokenApproval(false);
    setFlowStep("idle");
    setError(null);
    setNotice(null);
  }, [walletAddress, walletChainId]);


  const slippageBps = useMemo(() => {
    try {
      return parseSlippageBps(slippage);
    } catch {
      return null;
    }
  }, [slippage]);

  const canQuote = useMemo(() => {
    const n = Number(amount);
    return !!walletAddress && tokenIn !== tokenOut && Number.isFinite(n) && n > 0 && slippageBps !== null;
  }, [amount, tokenIn, tokenOut, walletAddress, slippageBps]);

  function updateSlippage(value: string) {
    setSlippage(value);
    setQuote(null);
    setPrepared(null);
    setPendingApproval(null);
    setError(null);
    setNotice(null);
  }

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setPrepared(null);
    setPendingApproval(null);
    setError(null);
    setNotice(null);
  }

  async function fetchMainnetQuotePayload(accountAddress: string): Promise<SwapQuote> {
    const response = await fetch("/api/uniswap/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: accountAddress,
        amount,
        tokenIn,
        tokenOut,
        chainId: 5042,
        slippageBps,
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(data) || data.ok !== true || typeof data.quoteSession !== "string") {
      const message = isRecord(data) && typeof data.detail === "string"
        ? data.detail
        : isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Unable to obtain an Arc Mainnet quote.";
      throw new Error(message);
    }
    return {
      amountOut: String(data.amountOut || ""),
      minimumAmountOut: String(data.minimumAmountOut || ""),
      route: String(data.routing || "Uniswap"),
      network: "mainnet",
      quoteSession: data.quoteSession,
      quoteSessionExpiresAt: typeof data.quoteSessionExpiresAt === "number" ? data.quoteSessionExpiresAt : undefined,
      permitData: isRecord(data.permitData) ? data.permitData : null,
      estimatedGasUsd: typeof data.estimatedGasUsd === "string" ? data.estimatedGasUsd : null,
    };
  }

  async function checkPermit2Allowance(accountAddress: string): Promise<boolean> {
    if (!meta.isMainnet || tokenIn === "USDC") return false;
    try {
      const tokenMeta = getToken(tokenIn, true);
      const requiredUnits = parseUnits(amount.trim(), tokenMeta.decimals);
      const current = await readAllowance(
        tokenMeta.address,
        accountAddress as Address,
        ARC_PERMIT2_CONTRACT as Address,
        true,
      );
      return current < requiredUnits;
    } catch {
      return false;
    }
  }

  async function getQuote() {
    if (!walletAddress) {
      setError("Connect your wallet before requesting a swap quote.");
      return;
    }
    if (tokenIn === tokenOut) {
      setError("Choose two different tokens.");
      return;
    }
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (slippageBps === null) {
      setError("Slippage must be between 0.1% and 5%.");
      return;
    }

    setQuoteBusy(true);
    setError(null);
    setNotice(null);
    setPrepared(null);
    setPendingApproval(null);
    setQuote(null);
    try {
      if (meta.isMainnet) {
        const { account } = await getVerifiedMainnetProvider(walletAddress);
        const [nextQuote, requiresApprove] = await Promise.all([
          fetchMainnetQuotePayload(account),
          checkPermit2Allowance(account),
        ]);
        setNeedsTokenApproval(requiresApprove);
        setQuote(nextQuote);
      } else {
        setNeedsTokenApproval(false);
        const raw = await getArcDexSwapQuote({ amount, tokenIn, tokenOut, chain: "Arc_Testnet", slippageBps });
        setQuote({ amountOut: raw.amountOut, minimumAmountOut: raw.minimumAmountOut, route: raw.route, network: "testnet" });
      }
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Unable to obtain a live Arc swap quote.");
    } finally {
      setQuoteBusy(false);
    }
  }

  async function approvePermit2InWallet() {
    if (!pendingApproval || !walletAddress) return;
    setSwapBusy(true);
    setThinking(true);
    setError(null);
    setNotice(null);
    try {
      const { provider, account } = await getVerifiedMainnetProvider(walletAddress);
      if (pendingApproval.from.toLowerCase() !== account.toLowerCase() || pendingApproval.chainId !== 5042) {
        throw new Error("Approval transaction does not match connected Arc Mainnet wallet.");
      }
      const approveTxHash = String(
        await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: account,
              to: pendingApproval.to,
              data: pendingApproval.data,
              value: "0x0",
            },
          ],
        }),
      );
      setNotice(`Waiting for Permit2 approval confirmation (${approveTxHash.slice(0, 10)}…)…`);
      await arcPublicClient(true).waitForTransactionReceipt({
        hash: approveTxHash as `0x${string}`,
        timeout: 90_000,
      });
      setPendingApproval(null);
      setNeedsTokenApproval(false);
      const refreshedQuote = await fetchMainnetQuotePayload(account);
      setQuote(refreshedQuote);
      setNotice("Permit2 approval confirmed ✓ Fresh quote loaded — click 'Confirm & Swap' to finish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permit2 approval failed.");
    } finally {
      setSwapBusy(false);
      setThinking(false);
    }
  }

  async function executePreparedMainnetSwap() {
    if (!prepared || !walletAddress) return;
    setSwapBusy(true);
    setThinking(true);
    setError(null);
    setNotice(null);
    try {
      const { provider, account } = await getVerifiedMainnetProvider(walletAddress);
      if (
        prepared.transaction.chainId !== 5042 ||
        prepared.transaction.from.toLowerCase() !== account.toLowerCase() ||
        !prepared.transaction.data.startsWith("0x")
      ) {
        throw new Error("Prepared transaction no longer matches the connected Arc Mainnet account.");
      }

      const gasHex = prepared.transaction.gasLimit
        ? `0x${BigInt(prepared.transaction.gasLimit).toString(16)}`
        : undefined;
      const rawValue = prepared.transaction.value || "0";
      const valueHex = rawValue && rawValue !== "0" && rawValue !== "0x0"
        ? (rawValue.startsWith("0x") ? rawValue : `0x${BigInt(rawValue).toString(16)}`)
        : "0x0";
      const txParams: Record<string, string> = {
        from: account,
        to: prepared.transaction.to,
        data: prepared.transaction.data,
        value: valueHex,
      };
      if (gasHex) txParams.gas = gasHex;

      const txHash = String(
        await provider.request({
          method: "eth_sendTransaction",
          params: [txParams],
        }),
      );

      setNotice(`Swap broadcast (${txHash.slice(0, 10)}…). Waiting for Arc Mainnet confirmation…`);
      const receipt = await arcPublicClient(true).waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 90_000,
      });
      if (receipt.status !== "success") {
        throw new Error(`Swap transaction reverted on Arc Mainnet (${txHash}).`);
      }

      if (prepared.receiptVerificationTicket) {
        const verifyRes = await fetch("/api/uniswap/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiptVerificationTicket: prepared.receiptVerificationTicket,
            transactionHash: txHash,
          }),
          cache: "no-store",
        });
        if (!verifyRes.ok && verifyRes.status !== 202) {
          console.warn("[AGFusion] Receipt verification warning", { status: verifyRes.status });
        }
      }

      const txId = uid("swap");
      addTransaction({
        id: txId,
        type: "swap",
        status: "success",
        amount,
        token: `${tokenIn} → ${tokenOut}`,
        fromChain: "Arc",
        toChain: "Arc",
        recipient: account,
        txHash,
        explorerUrl: explorerTxUrl(txHash, 5042),
        steps: [
          { name: "Validate Quote & Permit2", state: "success" },
          { name: "Simulate Universal Router 2.1.2", state: "success" },
          { name: "Broadcast Swap on Arc Mainnet", state: "success", txHash },
        ],
        createdAt: new Date().toISOString(),
        message: `Swapped ${amount} ${tokenIn} for ~${prettyAmount(quote?.amountOut)} ${tokenOut} on Arc Mainnet`,
        executionMode: "live",
      });
      setActiveTx(txId);
      setPrepared(null);
      setQuote(null);
      setNotice(`Swap confirmed on Arc Mainnet! Tx: ${txHash.slice(0, 14)}…`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mainnet swap execution failed.");
    } finally {
      setSwapBusy(false);
      setThinking(false);
    }
  }

  async function executeGuidedMainnetSwap() {
    if (!quote?.quoteSession || !walletAddress) {
      throw new Error("Request a fresh Mainnet quote before swapping.");
    }
    const gateResponse = await fetch("/api/uniswap/swap", { method: "GET", cache: "no-store" });
    const gate: unknown = await gateResponse.json().catch(() => null);
    if (!gateResponse.ok || !isRecord(gate) || gate.enabled !== true || typeof gate.executionEnabled !== "boolean") {
      setNotice("Mainnet transaction preparation is disabled in this deployment. Quote is read-only.");
      return;
    }

    const { provider, account } = await getVerifiedMainnetProvider(walletAddress);
    let activeQuote = quote;

    // Step 1: Upfront ERC-20 Approval to Permit2 (only when needed for non-native tokens)
    if (needsTokenApproval && tokenIn !== "USDC") {
      setFlowStep("approving");
      setNotice(`Step 1/3: Approve ${tokenIn} for Permit2 in your wallet…`);
      const tokenMeta = getToken(tokenIn, true);
      const approveAmount =
        approvalMode === "unlimited"
          ? maxUint256
          : parseUnits(amount.trim(), tokenMeta.decimals);
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [ARC_PERMIT2_CONTRACT as Address, approveAmount],
      });
      const approveTxHash = String(
        await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: account, to: tokenMeta.address, data: approveData, value: "0x0" }],
        }),
      );
      setNotice(`Waiting for ${tokenIn} approval confirmation (${approveTxHash.slice(0, 10)}…)…`);
      const approveReceipt = await arcPublicClient(true).waitForTransactionReceipt({
        hash: approveTxHash as `0x${string}`,
        timeout: 90_000,
      });
      if (approveReceipt.status !== "success") {
        throw new Error(`${tokenIn} approval reverted on Arc Mainnet.`);
      }
      setNeedsTokenApproval(false);
      // Automatically refresh quote so quoteSession & permitData reflect confirmed allowance
      setNotice("Approval confirmed ✓ Refreshing live quote…");
      activeQuote = await fetchMainnetQuotePayload(account);
      setQuote(activeQuote);
    }

    // Step 2: Permit2 EIP-712 Signature (if required by Uniswap quote)
    let signature: string | undefined;
    if (activeQuote.permitData) {
      setFlowStep("signing");
      setNotice("Sign Permit2 authorization in your wallet (gasless)…");
      const permitData = activeQuote.permitData;
      if (!isRecord(permitData.domain) || !isRecord(permitData.types) || !isRecord(permitData.values)) {
        throw new Error("The quote returned malformed Permit2 typed data. Request a new quote.");
      }
      const typedData = {
        domain: permitData.domain,
        types: permitData.types,
        primaryType: "PermitSingle",
        message: permitData.values,
      };
      const signed = await provider.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(typedData)],
      });
      if (typeof signed !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signed)) {
        throw new Error("The wallet did not return a valid 65-byte Permit2 signature.");
      }
      signature = signed;
    }

    // Step 3: Prepare & validate calldata on server
    setFlowStep("preparing");
    const response = await fetch("/api/uniswap/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteSession: activeQuote.quoteSession,
        ...(signature ? { signature } : {}),
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(data)) {
      if (isRecord(data) && isRecord(data.approvalTransaction)) {
        const appTx = data.approvalTransaction;
        setPendingApproval({
          chainId: Number(appTx.chainId || 5042),
          from: String(appTx.from || account),
          to: String(appTx.to || ""),
          data: String(appTx.data || ""),
          value: String(appTx.value || "0"),
          spender: String(appTx.spender || ""),
          amount: String(appTx.amount || ""),
        });
        setNeedsTokenApproval(true);
        throw new Error("Permit2 ERC-20 approval is required first. Click 'Approve' below.");
      }
      const message = isRecord(data) && typeof data.detail === "string"
        ? data.detail
        : isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Mainnet transaction preparation failed. Request a fresh quote.";
      throw new Error(message);
    }
    if (
      data.ok !== true ||
      typeof data.executionEnabled !== "boolean" ||
      !isRecord(data.transaction) ||
      Number(data.chainId) !== 5042 ||
      Number(data.transaction.chainId) !== 5042 ||
      String(data.transaction.from || "").toLowerCase() !== account.toLowerCase()
    ) {
      throw new Error("The server did not return a valid unsigned Arc Mainnet transaction.");
    }

    const txObj = {
      chainId: 5042,
      from: String(data.transaction.from),
      to: String(data.transaction.to),
      data: String(data.transaction.data || ""),
      value: String(data.transaction.value || "0"),
      gasLimit: String(data.transaction.gasLimit || ""),
      maxFeePerGas: typeof data.transaction.maxFeePerGas === "string" ? data.transaction.maxFeePerGas : undefined,
      maxPriorityFeePerGas: typeof data.transaction.maxPriorityFeePerGas === "string" ? data.transaction.maxPriorityFeePerGas : undefined,
      gasPrice: typeof data.transaction.gasPrice === "string" ? data.transaction.gasPrice : undefined,
    };

    if (!data.executionEnabled) {
      const validation = isRecord(data.validation) ? data.validation : undefined;
      setPrepared({
        executionEnabled: false,
        receiptVerificationTicket: typeof data.receiptVerificationTicket === "string" ? data.receiptVerificationTicket : undefined,
        transaction: txObj,
        validation: validation ? {
          estimatedGas: typeof validation.estimatedGas === "string" ? validation.estimatedGas : undefined,
          estimatedGasCost: typeof validation.estimatedGasCost === "string" ? validation.estimatedGasCost : undefined,
          minimumAmountOut: typeof validation.minimumAmountOut === "string" ? validation.minimumAmountOut : undefined,
          commandNames: Array.isArray(validation.commandNames) ? validation.commandNames.filter((v): v is string => typeof v === "string") : undefined,
        } : undefined,
      });
      setNotice("Unsigned Mainnet transaction prepared and validated (read-only mode).");
      return;
    }

    // Step 4: Immediately prompt wallet to sign & broadcast the swap!
    setFlowStep("broadcasting");
    setNotice("Confirm the swap transaction in your wallet…");
    const gasHex = txObj.gasLimit ? `0x${BigInt(txObj.gasLimit).toString(16)}` : undefined;
    const rawValue = txObj.value || "0";
    const valueHex = rawValue && rawValue !== "0" && rawValue !== "0x0"
      ? (rawValue.startsWith("0x") ? rawValue : `0x${BigInt(rawValue).toString(16)}`)
      : "0x0";
    const txParams: Record<string, string> = {
      from: account,
      to: txObj.to,
      data: txObj.data,
      value: valueHex,
    };
    if (gasHex) txParams.gas = gasHex;

    const txHash = String(
      await provider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      }),
    );

    setNotice(`Swap broadcast (${txHash.slice(0, 10)}…). Waiting for Arc Mainnet confirmation…`);
    const receipt = await arcPublicClient(true).waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`Swap transaction reverted on Arc Mainnet (${txHash}).`);
    }

    const receiptTicket = typeof data.receiptVerificationTicket === "string" ? data.receiptVerificationTicket : undefined;
    if (receiptTicket) {
      const verifyRes = await fetch("/api/uniswap/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptVerificationTicket: receiptTicket,
          transactionHash: txHash,
        }),
        cache: "no-store",
      });
      const verifyData: unknown = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !isRecord(verifyData) || verifyData.ok !== true) {
        throw new Error(
          isRecord(verifyData) && typeof verifyData.detail === "string"
            ? verifyData.detail
            : "Swap confirmed on-chain, but receipt verification failed.",
        );
      }
    }

    const txId = uid("tx");
    addTransaction({
      id: txId,
      type: "swap",
      status: "success",
      amount,
      token: tokenIn,
      tokenOut,
      fromChain: "Arc_Mainnet",
      toChain: "Arc_Mainnet",
      feeUsd: Number(activeQuote.estimatedGasUsd || 0.01),
      txHash,
      explorerUrl: explorerTxUrl(txHash, 5042),
      createdAt: new Date().toISOString(),
      message: `Swapped ${amount} ${tokenIn} → ${activeQuote.amountOut || ""} ${tokenOut} on Arc Mainnet`,
      executionMode: "live",
      steps: [
        { name: "Quote & Permit2", state: "success" },
        { name: "Broadcast Swap", state: "success", txHash },
        { name: "Arc Mainnet Finality", state: "success", txHash },
      ],
    });
    setActiveTx(txId);
    setPrepared(null);
    setQuote(null);
    setNotice(`✅ Swap confirmed on Arc Mainnet! Tx: ${txHash.slice(0, 14)}…`);
  }

  async function swap() {
    if (!quote) {
      await getQuote();
      return;
    }
    if (!walletAddress) {
      setError("Connect your wallet before swapping.");
      return;
    }
    if (slippageBps === null) {
      setError("Slippage must be between 0.1% and 5%.");
      return;
    }

    setSwapBusy(true);
    setThinking(true);
    setError(null);
    setNotice(null);
    try {
      if (meta.isMainnet) {
        await executeGuidedMainnetSwap();
        return;
      }
      const tx = await executeSwap({ amount, tokenIn, tokenOut, chain: "Arc_Testnet", slippageBps });
      addTransaction(tx);
      setActiveTx(tx.id);
      if (tx.status === "success") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap confirmed on-chain!");
      } else if (tx.status === "retryable") {
        setAmount("0");
        setQuote(null);
        setNotice(tx.message || "Swap submitted to Arc Testnet. Finality is confirming in the background.");
      } else {
        setError(tx.message || "Swap failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Swap failed.");
    } finally {
      setFlowStep("idle");
      setSwapBusy(false);
      setThinking(false);
    }
  }

  const minOutput = quote?.minimumAmountOut || (quote?.amountOut ? minimumReceived(quote.amountOut, slippage) : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">{meta.name} Swap</p>
        <Badge variant="cyan" className="shrink-0">{meta.isMainnet ? "Uniswap · Live Swap" : "USDC · EURC"}</Badge>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">From</span>
            <select value={tokenIn} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenIn(e.target.value as ArcSwapToken); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" className="mb-0.5 h-10 w-10 shrink-0 px-0 rounded-xl" disabled={quoteBusy || swapBusy} onClick={flip} aria-label="Reverse swap"><ArrowDownUp className="h-4 w-4" /></Button>
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">To</span>
            <select value={tokenOut} disabled={quoteBusy || swapBusy} onChange={(e) => { setTokenOut(e.target.value as ArcSwapToken); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100">
              {ARC_SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Amount</span>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} disabled={quoteBusy || swapBusy} onChange={(e) => { setAmount(e.target.value); setQuote(null); setPrepared(null); setError(null); setNotice(null); }} placeholder="0.50" />
        </label>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Slippage tolerance</span></div>
            <div className="flex items-center gap-1.5">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button key={preset} type="button" disabled={quoteBusy || swapBusy} onClick={() => updateSlippage(preset)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${slippage === preset ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"}`}>
                  {preset}%
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input type="number" min="0.1" max="5" step="0.1" inputMode="decimal" value={slippage} disabled={quoteBusy || swapBusy} onChange={(e) => updateSlippage(e.target.value)} className="h-8 w-20 text-center text-xs" aria-label="Custom slippage percentage" />
            <span className="text-[11px] text-slate-500">%</span>
            <span className="ml-auto text-[10px] text-slate-500">Range: 0.1%–5%</span>
          </div>
        </div>
      </div>

      {quote && (
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">Estimated receive</span><span className="text-sm font-semibold text-slate-50">{prettyAmount(quote.amountOut)} {tokenOut}</span></div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Minimum receive</p><p className="mt-0.5 text-slate-200 font-medium">{prettyAmount(minOutput)} {tokenOut}</p></div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2"><p className="text-slate-500 text-[10px]">Route</p><p className="mt-0.5 text-slate-200 font-medium">{quote.route || "Arc DEX"}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />{meta.isMainnet ? "Server-validated quote" : "Verified on-chain"}</span>
            <span className="font-semibold text-cyan-300">{slippage}% slippage</span>
          </div>
          {meta.isMainnet && tokenIn !== "USDC" && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[10px]">
              <span className="flex items-center gap-1.5 text-slate-300">
                {needsTokenApproval ? (
                  <><span className="h-2 w-2 rounded-full bg-amber-400" />Step 1: Approve {tokenIn} for Permit2</>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Permit2 Allowance: Ready</>
                )}
              </span>
              {needsTokenApproval && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={swapBusy}
                    onClick={() => setApprovalMode("exact")}
                    className={`rounded px-1.5 py-0.5 font-semibold transition ${approvalMode === "exact" ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    disabled={swapBusy}
                    onClick={() => setApprovalMode("unlimited")}
                    className={`rounded px-1.5 py-0.5 font-semibold transition ${approvalMode === "unlimited" ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Unlimited
                  </button>
                </div>
              )}
            </div>
          )}
          {meta.isMainnet && quote.quoteSessionExpiresAt && (
            <p className="text-[10px] text-slate-500">Quote session expires at {new Date(quote.quoteSessionExpiresAt * 1000).toLocaleTimeString()}.</p>
          )}
          {meta.isMainnet && quote.estimatedGasUsd && <p className="text-[10px] text-slate-500">Estimated gas: ${quote.estimatedGasUsd}</p>}
        </div>
      )}

      {pendingApproval && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5 space-y-2.5">
          <p className="text-xs font-semibold text-amber-200">Permit2 ERC-20 Approval Required</p>
          <p className="text-[11px] text-slate-300">Approve the exact input amount ({pendingApproval.amount} base units) to Permit2 ({pendingApproval.spender}).</p>
          <Button className="w-full font-semibold" disabled={swapBusy} onClick={() => void approvePermit2InWallet()}>
            {swapBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving in wallet…</> : "Approve Exact Amount to Permit2"}
          </Button>
        </div>
      )}

      {prepared && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5 space-y-2.5">
          <p className="text-xs font-semibold text-amber-200">{prepared.executionEnabled ? "Validated Mainnet Swap Ready" : "Unsigned Mainnet transaction prepared"}</p>
          <p className="text-[11px] text-slate-300">{prepared.executionEnabled ? "The server validated the Universal Router 2.1.2 calldata and passed simulation." : "The server validated the transaction and simulation. It has not been signed or broadcast."}</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><span className="text-slate-500">Destination</span><p className="break-all text-slate-200">{prepared.transaction.to}</p></div>
            <div><span className="text-slate-500">Gas limit</span><p className="text-slate-200">{prepared.transaction.gasLimit}</p></div>
            {prepared.validation?.estimatedGas && <div><span className="text-slate-500">Estimated gas</span><p className="text-slate-200">{prepared.validation.estimatedGas}</p></div>}
            {prepared.validation?.estimatedGasCost && <div><span className="text-slate-500">Estimated gas cost</span><p className="text-slate-200">{prepared.validation.estimatedGasCost} wei</p></div>}
          </div>
          {prepared.executionEnabled && (
            <Button className="w-full font-semibold" disabled={swapBusy} onClick={() => void executePreparedMainnetSwap()}>
              {swapBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Broadcasting Swap…</> : "Sign & Broadcast Mainnet Swap"}
            </Button>
          )}
        </div>
      )}

      {notice && <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-cyan-200">{notice}</div>}
      {error && <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-red-200 whitespace-pre-wrap">{error}</div>}

      {!quote && <Button className="w-full font-semibold" disabled={!canQuote || quoteBusy || swapBusy} onClick={() => void getQuote()}>{quoteBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting quote…</> : "Get Quote"}</Button>}

      {quote && (
        <div className="space-y-2">
          <Button className="w-full font-semibold" disabled={swapBusy || !walletAddress || !!prepared} onClick={() => void swap()}>
            {swapBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {flowStep === "approving"
                  ? `Approving ${tokenIn}…`
                  : flowStep === "signing"
                    ? "Signing Permit2…"
                    : flowStep === "preparing"
                      ? "Validating route…"
                      : flowStep === "broadcasting"
                        ? "Confirming swap…"
                        : "Confirming in wallet…"}
              </>
            ) : meta.isMainnet ? (
              needsTokenApproval ? `Approve ${tokenIn} & Swap` : "Confirm & Swap"
            ) : (
              "Confirm Swap"
            )}
          </Button>
          <Button type="button" variant="outline" className="w-full text-xs h-9" disabled={swapBusy} onClick={() => void getQuote()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh Quote
          </Button>
          {meta.isMainnet && (
            <p className="text-center text-[10px] text-slate-500">Secured by Uniswap Universal Router 2.1.2 &amp; Permit2 on Arc Mainnet.</p>
          )}
        </div>
      )}
    </div>
  );
}
