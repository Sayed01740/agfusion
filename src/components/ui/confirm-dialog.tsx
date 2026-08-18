"use client";

import { Button } from "@/components/ui/button";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { feeFromUsd, type FeeQuote } from "@/lib/fees";

export function ConfirmDialog({
  open,
  title,
  summary,
  feeUsd,
  feeQuote,
  mode,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  summary: string;
  feeUsd?: number;
  feeQuote?: FeeQuote;
  mode?: "demo" | "live";
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;

  const quote = feeQuote ?? (typeof feeUsd === "number" ? feeFromUsd(feeUsd) : null);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md glass-strong rounded-2xl border border-cyan-500/20 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 mb-1">
            Confirm · {mode === "demo" ? "demo path" : "live wallet signature"}
          </div>
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{summary}</p>
        </div>

        {title.toLowerCase().includes("transfer") && (
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300 text-xs">✓</span>
              <div>
                <p className="text-xs font-semibold text-slate-100">Transaction security preview</p>
                <p className="text-[10px] text-slate-500">Review these details before your wallet opens.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-white/[0.03] p-2">
                <p className="text-slate-500">Protocol</p>
                <p className="text-slate-200 font-medium">Circle CCTP v2</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2">
                <p className="text-slate-500">Asset</p>
                <p className="text-slate-200 font-medium">USDC</p>
              </div>
            </div>

            <ul className="space-y-1.5 text-[10px] text-slate-400">
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Amount and source/destination route are shown above and reviewed before signing.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Destination is the connected wallet unless you explicitly choose another recipient.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Bridge recovery is state-bound and does not resubmit a confirmed burn.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Your wallet remains the final authority. AGFusion never asks for seed phrases or private keys.</span></li>
            </ul>

            <p className="text-[10px] leading-relaxed text-slate-500 border-t border-white/5 pt-2">
              Some wallets may show “Simulation Not Supported” or “Unknown Signature Type” for complex CCTP contract calls. Those labels come from the wallet's decoder/simulation layer, not from AGFusion. Always compare the wallet prompt with the details above before signing.
            </p>
          </div>
        )}

        {quote && <FeeLineItems quote={quote} />}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={busy}
            type="button"
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={onConfirm}
            disabled={busy}
            type="button"
          >
            {busy ? "Working…" : "Sign in wallet"}
          </Button>
        </div>
        <p className="text-[10px] text-slate-600 text-center">
          Fees shown above are route-specific estimates · AGFusion never asks for seed phrases.
        </p>
      </div>
    </div>
  );
}
