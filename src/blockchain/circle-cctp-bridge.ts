"use client";

import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { getAppKit } from "@/sdk/appkit-client";
import { createAppKitAdapterFromBrowser, switchToChainId } from "@/sdk/wallet-adapter";
import { getCctpConfig } from "@/lib/cctp-chains";
import { explorerTxUrl } from "@/lib/arc-chain";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { recordBridgeDebug } from "@/lib/bridge-debug";
import { finalizeVerifiedTransaction } from "@/lib/financial-receipt";
import { uid } from "@/lib/utils";

export async function executeCircleCctpBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  txId?: string;
}): Promise<TransactionRecord> {
  const debugId = params.txId || uid("bridge");
  const kit = await getAppKit();
  if (!kit) throw new Error("Circle App Kit is not available. Refresh the page and reconnect the wallet.");

  const meta = getActiveWalletMeta();
  const sourceConfig = getCctpConfig(params.fromChain);
  const destinationConfig = getCctpConfig(params.toChain);
  if (!sourceConfig || !destinationConfig) throw new Error("Selected chains are not configured for Circle CCTP.");

  const wired = await createAppKitAdapterFromBrowser({ requireArc: false });
  if (!wired) throw new Error("Could not create the connected wallet adapter.");
  await switchToChainId(wired.provider, params.fromChain);

  const recipient = params.recipient || meta?.address;
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error("A valid destination wallet address is required.");

  recordBridgeDebug("cctp.sdk.start", { amount: params.amount, fromChain: params.fromChain, toChain: params.toChain, recipient, wallet: meta?.address, architecture: "Circle-App-Kit-CCTPv2-Forwarding-Service", completionGate: "destination-receipt+USDC-transfer" }, debugId, "Starting Circle CCTP bridge; SDK success alone cannot complete it");

  const steps: TxStep[] = [];
  const eventHandler = (payload: any) => {
    const action = String(payload?.action || payload?.method || payload?.name || "");
    const values = payload?.values || {};
    const state = String(values?.state || values?.status || payload?.state || "").toLowerCase();
    const txHash = values?.txHash || payload?.txHash;
    const lower = action.toLowerCase();
    let name = action || "Bridge step";
    if (lower.includes("approve")) name = "USDC Approval";
    else if (lower.includes("burn")) name = "CCTP Burn";
    else if (lower.includes("fetchattestation") || lower.includes("attestation")) name = "Circle Attestation / Forwarding";
    else if (lower.includes("mint") || lower.includes("receive") || lower.includes("destination")) name = "Destination Mint";
    if (!state) return;
    const mapped: TxStep["state"] = state === "success" ? "success" : state === "error" ? "error" : "pending";
    const index = steps.findIndex((s) => s.name === name);
    const value: TxStep = { name, state: mapped, txHash, message: values?.errorMessage || values?.error };
    if (index >= 0) steps[index] = { ...steps[index], ...value }; else steps.push(value);
    recordBridgeDebug("cctp.sdk.event", { action, state, txHash, values }, debugId, `Circle SDK event: ${action}`);
  };

  kit.on("*", eventHandler);
  try {
    const bridgeParams: any = { from: { adapter: wired.adapter, chain: params.fromChain }, to: { recipientAddress: recipient, chain: params.toChain, useForwarder: true }, amount: params.amount, token: "USDC" };
    recordBridgeDebug("cctp.sdk.request", bridgeParams, debugId, "Calling Circle App Kit kit.bridge() with useForwarder=true");
    let result: any = await kit.bridge(bridgeParams);
    recordBridgeDebug("cctp.sdk.result", { state: result?.state, provider: result?.provider, steps: result?.steps, source: result?.source, destination: result?.destination }, debugId, `Circle App Kit returned state=${result?.state}`);

    const mergeResultSteps = () => {
      for (const s of result?.steps || []) {
        const name = String(s?.name || "Bridge step");
        const mapped: TxStep["state"] = s?.state === "error" ? "error" : s?.state === "pending" ? "pending" : "success";
        const existing = steps.findIndex((x) => x.name === name);
        const normalized: TxStep = { name, state: mapped, txHash: s?.txHash, message: s?.errorMessage || s?.error };
        if (existing >= 0) steps[existing] = { ...steps[existing], ...normalized }; else steps.push(normalized);
      }
    };
    mergeResultSteps();

    if (result?.state === "error") {
      const retryable = String(result?.steps?.find((s: any) => s?.state === "error")?.errorMessage || "").match(/timeout|network|temporary|rate.?limit|attestation/i);
      if (retryable) {
        recordBridgeDebug("cctp.sdk.retry", { reason: retryable[0] }, debugId, "Retrying existing Circle SDK bridge without another burn");
        result = await kit.retryBridge(result, { from: wired.adapter, to: wired.adapter });
        mergeResultSteps();
      } else {
        const failed = result?.steps?.find((s: any) => s?.state === "error");
        throw new Error(failed?.errorMessage || failed?.error || "Circle CCTP bridge failed.");
      }
    }
    if (result?.state === "error") {
      const failed = result?.steps?.find((s: any) => s?.state === "error");
      throw new Error(failed?.errorMessage || failed?.error || "Circle CCTP bridge failed.");
    }

    const destinationStep = [...steps].reverse().find((s) => /mint|destination|receive/i.test(s.name || "") && !!s.txHash);
    const burnStep = steps.find((s) => /burn/i.test(s.name || "") && !!s.txHash);
    const approvalStep = steps.find((s) => /approve/i.test(s.name || "") && !!s.txHash);

    if (!destinationStep?.txHash) {
      const partial: TransactionRecord = { id: debugId, type: "bridge", status: "retryable", retryable: true, amount: params.amount, token: "USDC", fromChain: params.fromChain, toChain: params.toChain, recipient, steps, txHash: burnStep?.txHash, explorerUrl: burnStep?.txHash ? explorerTxUrl(burnStep.txHash) : destinationConfig.explorer, createdAt: new Date().toISOString(), message: "Source bridge step completed, but Circle has not exposed a destination settlement hash yet. Recovery will resume without another burn.", executionMode: "live", bridgeResult: result };
      recordBridgeDebug("cctp.sdk.pending", { result, steps }, debugId, "Bridge pending: destination settlement hash is not available");
      return partial;
    }

    // Circle SDK success is evidence of forwarding, not the final AGFusion success gate.
    // Build a pending record first, then prove the destination transaction and USDC event.
    const candidate: TransactionRecord = {
      id: debugId,
      type: "bridge",
      status: "retryable",
      retryable: true,
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      recipient,
      steps,
      txHash: destinationStep.txHash,
      explorerUrl: destinationConfig.explorer ? destinationConfig.explorer.replace("{hash}", destinationStep.txHash) : explorerTxUrl(destinationStep.txHash),
      createdAt: new Date().toISOString(),
      message: `Circle reported destination mint for ${params.amount} USDC. Verifying destination settlement on-chain.`,
      executionMode: "live",
      bridgeResult: { ...result, forwardTxHash: destinationStep.txHash },
    };

    recordBridgeDebug("cctp.destination.verification.start", { destinationTx: destinationStep.txHash, destinationChain: params.toChain, destinationUsdc: destinationConfig.usdc, recipient, expectedAmount: params.amount }, debugId, "Verifying destination receipt and exact USDC Transfer event");
    const verified = await finalizeVerifiedTransaction(candidate, params.toChain);
    recordBridgeDebug("cctp.destination.verification.result", { status: verified.status, retryable: verified.retryable, destinationTx: destinationStep.txHash, recipient, expectedAmount: params.amount, steps: verified.steps, message: verified.message }, debugId, verified.status === "success" ? "Destination settlement proven on-chain" : "Destination settlement not yet proven; bridge remains pending");

    if (verified.status !== "success") return verified;

    recordBridgeDebug("cctp.sdk.completed", { approvalTx: approvalStep?.txHash, burnTx: burnStep?.txHash, destinationTx: destinationStep.txHash, successfulSteps: verified.steps?.filter((s) => s.state === "success"), proof: "destination receipt status=0x1 + exact USDC Transfer event" }, debugId, "Circle CCTP bridge completed after destination on-chain verification");
    return verified;
  } finally {
    try { kit.off?.("*", eventHandler); } catch {}
  }
}
