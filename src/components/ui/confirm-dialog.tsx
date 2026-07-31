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
      <div className="relative w-full max-w-md glass-strong rounded-2xl border border-cyan-500/20 p-5 shadow-2xl space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 mb-1">
            Confirm · {mode === "demo" ? "demo path" : "live wallet signature"}
          </div>
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{summary}</p>
        </div>
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
          Fees quoted in USDC on Arc · AGFusion never asks for seed phrases.
        </p>
      </div>
    </div>
  );
}
