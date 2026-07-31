"use client";

import { useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { quoteX402Fee } from "@/lib/fees";
import { assessRouteRisk } from "@/lib/agent-economy";
import { estimateBridgeDemo } from "@/blockchain/appkit-service";
import { liveSendUsdcOnArc } from "@/blockchain/live-send";
import { usePilotStore } from "@/store/pilot-store";
import type { ChainId, X402Receipt } from "@/types";
import { resolveChain } from "@/lib/chains";
import { AGFUSION_DEPLOYER } from "@/lib/onchain";

/**
 * Route risk oracle with x402 micropayment on Arc.
 * 1) Pay 0.001 USDC (native) to AGFusion payee
 * 2) POST /api/x402/risk-oracle with paymentTxHash → verified assessment
 * Free local assess available without payment for exploration.
 */
export function RiskOracleCard({ embedded = false }: { embedded?: boolean }) {
  const { walletAddress, addTransaction, setActiveTx } = usePilotStore();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("Base_Sepolia");
  const [to, setTo] = useState("Arc_Testnet");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<X402Receipt | null>(null);
  const [result, setResult] = useState<ReturnType<
    typeof assessRouteRisk
  > | null>(null);
  const [quote, setQuote] = useState<ReturnType<
    typeof estimateBridgeDemo
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidNote, setPaidNote] = useState<string | null>(null);
  const fee = quoteX402Fee("risk_oracle");

  async function runFree() {
    setBusy(true);
    setResult(null);
    setQuote(null);
    setError(null);
    setReceipt(null);
    setPaidNote(null);
    try {
      const fromChain = (resolveChain(from) || "Base_Sepolia") as ChainId;
      const toChain = (resolveChain(to) || "Arc_Testnet") as ChainId;
      const bridgeQuote = estimateBridgeDemo(amount, fromChain, toChain);
      setQuote(bridgeQuote);
      const risk = assessRouteRisk({ fromChain, toChain, amount });
      risk.factors = [
        ...risk.factors,
        `Est. bridge fee ~$${bridgeQuote.feeUsd.toFixed(3)}`,
        "Free local assess (not x402-paid)",
      ];
      setResult(risk);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPaidX402() {
    if (!walletAddress) {
      setError("Connect wallet on Arc to pay x402 micropayment.");
      return;
    }
    setBusy(true);
    setResult(null);
    setQuote(null);
    setError(null);
    setReceipt(null);
    setPaidNote("Paying 0.001 USDC on Arc (x402)… confirm in wallet");
    try {
      const fromChain = (resolveChain(from) || "Base_Sepolia") as ChainId;
      const toChain = (resolveChain(to) || "Arc_Testnet") as ChainId;

      // 1) Micropayment: native USDC on Arc to project payee
      const payTx = await liveSendUsdcOnArc({
        amount: "0.001",
        recipient: AGFUSION_DEPLOYER,
        recipientLabel: "x402 · risk_oracle",
      });
      if (!payTx.txHash) {
        throw new Error("Payment tx missing hash — cannot complete x402.");
      }
      setPaidNote(`Payment sent ${payTx.txHash.slice(0, 12)}… verifying…`);

      // 2) Call paid API
      const res = await fetch("/api/x402/risk-oracle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          fromChain,
          toChain,
          paymentTxHash: payTx.txHash,
          payer: walletAddress,
        }),
      });

      if (res.status === 402) {
        const body = await res.json();
        throw new Error(
          body.message ||
            body.error ||
            "Payment not accepted. Check payee address and amount.",
        );
      }
      if (!res.ok) {
        throw new Error(`Risk API error HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        risk: ReturnType<typeof assessRouteRisk>;
        quote: ReturnType<typeof estimateBridgeDemo>;
        payment: {
          txHash: string;
          amountUsdc: string;
          explorerUrl: string;
        };
      };

      setResult(data.risk);
      setQuote(data.quote);
      setReceipt({
        protocol: "x402",
        status: "paid",
        tool: "risk_oracle",
        resource: `route:${fromChain}->${toChain}:${amount}`,
        amountUsdc: Number(data.payment.amountUsdc),
        amountLabel: `${data.payment.amountUsdc} USDC`,
        chainId: 5042002,
        chain: "Arc_Testnet",
        payer: walletAddress,
        paidAt: new Date().toISOString(),
        receiptId: data.payment.txHash,
      });
      setPaidNote(`✓ x402 paid · ${data.payment.explorerUrl}`);

      const id = `tx_x402_${Date.now()}`;
      addTransaction({
        id,
        type: "send",
        status: "success",
        amount: data.payment.amountUsdc,
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Arc_Testnet",
        recipient: AGFUSION_DEPLOYER,
        recipientLabel: "x402 risk_oracle",
        txHash: data.payment.txHash,
        explorerUrl: data.payment.explorerUrl,
        feeUsd: data.quote.feeUsd,
        message: `x402 Risk oracle · score ${data.risk.score} (${data.risk.level})`,
        executionMode: "live",
        steps: [
          {
            name: "x402 micropayment",
            state: "success",
            txHash: data.payment.txHash,
          },
          { name: "Risk assessment", state: "success" },
        ],
        createdAt: new Date().toISOString(),
      });
      setActiveTx(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "x402 assessment failed");
      setPaidNote(null);
    } finally {
      setBusy(false);
    }
  }

  const body = (
      <div className="space-y-3">
        {!embedded && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Free local assess, or <strong className="text-slate-400">pay 0.001 USDC</strong>{" "}
          on Arc (x402) for a verified paid assessment.
        </p>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <Input
            className="text-xs h-9"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
          />
          <Input
            className="text-xs h-9"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="From"
          />
          <Input
            className="text-xs h-9"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
          />
        </div>
        <FeeLineItems quote={fee} compact />
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={() => void runFree()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Free assess
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={busy || !walletAddress}
            onClick={() => void runPaidX402()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Pay 0.001 · x402
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-400 whitespace-pre-wrap">{error}</p>
        )}
        {paidNote && (
          <p className="text-xs text-cyan-300/90 break-all">{paidNote}</p>
        )}
        {receipt && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100/90 font-mono">
            x402 {receipt.status} · {receipt.amountLabel} ·{" "}
            {receipt.receiptId.slice(0, 14)}…
          </div>
        )}
        {result && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">
                Score {result.score}
              </span>
              <Badge
                variant={
                  result.level === "low"
                    ? "success"
                    : result.level === "elevated"
                      ? "outline"
                      : "cyan"
                }
              >
                {result.level}
              </Badge>
            </div>
            <p className="text-slate-400">{result.recommendation}</p>
            <ul className="text-slate-500 space-y-0.5 list-disc list-inside">
              {result.factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {quote && (
              <p className="text-slate-500 pt-1">
                Quote: {quote.route} · ~${quote.feeUsd.toFixed(3)} · {quote.eta}
              </p>
            )}
          </div>
        )}
      </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Route risk oracle
          </CardTitle>
          <Badge variant="outline">x402 · Arc</Badge>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
