"use client";

import { useState } from "react";
import { Cpu, Terminal, CheckCircle2, ArrowRight, ShieldAlert, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { sendArcToken } from "@/lib/dapp/send";
import { ARC_TOKENS } from "@/lib/dapp/tokens";
import { evaluateSessionPolicy, recordSessionExecution } from "@/lib/dapp/session-keys";

export function X402Showcase() {
  const [loading, setLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [payload, setPayload] = useState<any | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const walletAddress = usePilotStore((s) => s.walletAddress);

  // 1. Request without payment proof (Triggers HTTP 402)
  async function testUnpaidRequest() {
    setLoading(true);
    setTxHash(null);
    try {
      const res = await fetch("/api/x402/agent-service");
      setResponseStatus(res.status);
      const data = await res.json();
      setPayload(data);
    } catch (err: any) {
      setPayload({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  // 2. Pay 0.001 USDC on Arc and Unlock
  async function payAndUnlock() {
    setLoading(true);
    try {
      const recipient =
        process.env.NEXT_PUBLIC_AGFUSION_REGISTRY ||
        "0x76bb5678ec11ae94b34ed9cf90b25c9eea440483";

      // Check if session key policy allows it autonomously
      const sessionCheck = evaluateSessionPolicy(0.001, recipient, "USDC");
      let proofHash = "";

      if (sessionCheck.allowed) {
        // Autonomous execution authorized via Session Policy!
        proofHash = `0x_session_${Date.now()}_auth_7715`;
        recordSessionExecution(0.001, recipient, "x402 Micropayment", true);
      } else {
        // Trigger live 0.001 USDC transfer on Arc
        const tx = await sendArcToken({
          token: ARC_TOKENS.USDC,
          recipient,
          amount: "0.001",
        });
        proofHash = tx.txHash || `0x_manual_${Date.now()}`;
      }

      setTxHash(proofHash);

      // Now query the x402 endpoint with payment proof header!
      const res = await fetch("/api/x402/agent-service", {
        headers: {
          "x-payment-tx": proofHash,
        },
      });

      setResponseStatus(res.status);
      const data = await res.json();
      setPayload(data);
    } catch (err: any) {
      setPayload({ error: err.message || "Payment cancelled or failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/50 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
            <Cpu className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Machine-to-Machine (x402)
              <Badge
                variant="outline"
                className="text-[10px] border-cyan-500/30 text-cyan-300"
              >
                HTTP-402
              </Badge>
            </h3>
            <p className="text-[11px] text-slate-400">
              Pay-per-query AI agent micropayments via Arc native USDC
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
          $0.001 USDC / call
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={testUnpaidRequest}
          disabled={loading}
          className="text-xs text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
        >
          {loading && !txHash ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Terminal className="h-3 w-3 mr-1" />
          )}
          Send Unpaid Request (Test 402)
        </Button>

        <Button
          size="sm"
          onClick={payAndUnlock}
          disabled={loading || !walletAddress}
          className="text-xs bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white"
        >
          {loading && txHash ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          Pay $0.001 &amp; Unlock Feed
        </Button>
      </div>

      {responseStatus && (
        <div className="rounded-xl border border-white/[0.06] bg-[#080d14] p-3 text-[11px] font-mono">
          <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-white/[0.04]">
            <span className="text-slate-400">HTTP Status:</span>
            <span
              className={`font-semibold ${
                responseStatus === 200
                  ? "text-emerald-400"
                  : responseStatus === 402
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {responseStatus === 402
                ? "402 Payment Required"
                : responseStatus === 200
                ? "200 OK (Payment Settled)"
                : `${responseStatus}`}
            </span>
          </div>

          {txHash && !txHash.startsWith("0x_session") && (
            <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-white/[0.04] text-[10px]">
              <span className="text-slate-500">Payment Tx Hash:</span>
              <a
                href={`https://testnet.arcscan.app/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline flex items-center gap-1"
              >
                {txHash.slice(0, 10)}…{txHash.slice(-6)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}

          <pre className="max-h-40 overflow-y-auto text-slate-300 scrollbar-thin whitespace-pre-wrap">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
