"use client";

import { useState } from "react";
import { Cpu, Terminal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function X402Showcase() {
  const [loading, setLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [payload, setPayload] = useState<any | null>(null);

  // Safe challenge preview only. The paid flow stays disabled until the
  // server verifies Arc Testnet ERC-20 receipts and prevents payment replay.
  async function testUnpaidRequest() {
    setLoading(true);
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
              Arc USDC agent micropayment demonstration
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
          Payments paused
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
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Terminal className="h-3 w-3 mr-1" />
          )}
          Check Payment Challenge
        </Button>

        <Button
          size="sm"
          disabled
          className="text-xs bg-slate-700 text-slate-300 cursor-not-allowed"
        >
          Payment temporarily unavailable
        </Button>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-amber-200/80">
        Payment is disabled until the server can verify the Arc Testnet USDC
        transfer receipt, recipient, amount, and replay status. Browser-local
        session policy is not accepted as payment proof. Do not send funds for
        this demo while verification is unavailable.
      </p>

      {responseStatus !== null && (
        <div className="rounded-xl border border-white/[0.06] bg-[#080d14] p-3 text-[11px] font-mono">
          <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-white/[0.04]">
            <span className="text-slate-400">HTTP Status:</span>
            <span
              className={`font-semibold ${
                responseStatus === 402
                  ? "text-amber-400"
                  : responseStatus >= 500
                  ? "text-red-400"
                  : "text-slate-300"
              }`}
            >
              {responseStatus === 402
                ? "402 Payment Required (verification unavailable)"
                : `${responseStatus}`}
            </span>
          </div>

          <pre className="max-h-40 overflow-y-auto text-slate-300 scrollbar-thin whitespace-pre-wrap">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
