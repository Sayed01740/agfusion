"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
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
  const titleId = useId();
  const summaryId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const quote = feeQuote ?? (typeof feeUsd === "number" ? feeFromUsd(feeUsd) : null);

  return (
    <ModalDialog open={open} onDismiss={onCancel} busy={busy} labelledBy={titleId} describedBy={summaryId} initialFocusRef={titleRef}>
      <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
            Confirm · {mode === "demo" ? "demo path" : "live wallet signature"}
          </div>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="rounded text-lg font-semibold text-foreground">{title}</h2>
          <p id={summaryId} className="text-sm text-muted-foreground mt-1 leading-relaxed">{summary}</p>
        </div>

        {title.toLowerCase().includes("transfer") && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent text-xs">✓</span>
              <div>
                <p className="text-xs font-semibold text-foreground">Transaction security preview</p>
                <p className="text-[10px] text-muted-foreground">Review these details before your wallet opens.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-white/[0.03] p-2">
                <p className="text-muted-foreground">Protocol</p>
                <p className="text-foreground font-medium">Circle CCTP v2</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2">
                <p className="text-muted-foreground">Asset</p>
                <p className="text-foreground font-medium">USDC</p>
              </div>
            </div>

            <ul className="space-y-1.5 text-[10px] text-muted-foreground">
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Amount and source/destination route are shown above and reviewed before signing.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Destination is the connected wallet unless you explicitly choose another recipient.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Bridge recovery is state-bound and does not resubmit a confirmed burn.</span></li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Your wallet remains the final authority. AGFusion never asks for seed phrases or private keys.</span></li>
            </ul>

            <p className="text-[10px] leading-relaxed text-muted-foreground border-t border-border pt-2">
              Some wallets may show “Simulation Not Supported” or “Unknown Signature Type” for complex CCTP contract calls. Those labels come from the wallet's decoder/simulation layer, not from AGFusion. Always compare the wallet prompt with the details above before signing.
            </p>
          </div>
        )}

        {quote && <FeeLineItems quote={quote} />}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="min-h-11 flex-1 border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-accent motion-reduce:transition-none motion-reduce:transform-none"
            onClick={onCancel}
            disabled={busy}
            type="button"
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 flex-1 border-accent bg-accent bg-none text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent motion-reduce:transition-none motion-reduce:transform-none"
            onClick={onConfirm}
            disabled={busy}
            type="button"
          >
            {busy ? "Working…" : "Sign in wallet"}
          </Button>
        </div>
        <p role="status" className="sr-only">{busy ? "Working. Please complete the request in your wallet." : ""}</p>
        <p className="text-[10px] text-muted-foreground text-center">
          Fees shown above are route-specific estimates · AGFusion never asks for seed phrases.
        </p>
      </div>
    </ModalDialog>
  );
}
