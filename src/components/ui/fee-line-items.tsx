"use client";

import type { FeeQuote } from "@/lib/fees";
import { formatUsdc } from "@/lib/fees";
import { cn } from "@/lib/utils";

export function FeeLineItems({
  quote,
  compact,
  className,
}: {
  quote: FeeQuote;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] px-3 py-2.5 space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-cyan-300/80">
          Fee line item · USDC gas
        </span>
        <span className="text-sm font-semibold tabular-nums text-cyan-100">
          {quote.headline}
        </span>
      </div>
      {!compact && (
        <ul className="space-y-1">
          {quote.lineItems.map((line) => (
            <li
              key={line.id}
              className="flex justify-between gap-2 text-[11px] text-slate-400"
            >
              <span>
                {line.label}
                {line.note ? (
                  <span className="block text-[10px] text-slate-600">
                    {line.note}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums text-slate-300 shrink-0">
                {formatUsdc(line.amountUsdc)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-slate-500 leading-relaxed">{quote.tip}</p>
    </div>
  );
}
