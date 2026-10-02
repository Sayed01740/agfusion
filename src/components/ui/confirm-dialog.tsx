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
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-card/60 border border-border/40 p-2">
                <p className="text-muted-foreground text-[10px]">Protocol</p>
                <p className="text-foreground font-medium text-xs">Circle CCTP v2</p>
              </div>
              <div className="rounded-lg bg-card/60 border border-border/40 p-2">
                <p className="text-muted-foreground text-[10px]">Settlement Asset</p>
                <p className="text-foreground font-medium text-xs">USDC</p>
              </div>
            </div>
          </div>
        )}

        {quote && <FeeLineItems quote={quote} />}
        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            className="min-h-10 flex-1 border-border bg-secondary text-secondary-foreground hover:bg-muted"
            onClick={onCancel}
            disabled={busy}
            type="button"
          >
            Cancel
          </Button>
          <Button
            className="min-h-10 flex-1 border-accent bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
            onClick={onConfirm}
            disabled={busy}
            type="button"
          >
            {busy ? "Confirming…" : "Confirm"}
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
