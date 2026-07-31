"use client";

import {
  ArrowRight,
  Check,
  Clock,
  Fuel,
  Loader2,
  Route,
  Wallet,
} from "lucide-react";
import type { ActionPreview } from "@/types";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/fees";
import { CHAINS } from "@/lib/chains";

export function ActionPreviewCard({
  preview,
  onExecute,
  busy = false,
}: {
  preview: ActionPreview;
  onExecute: () => void;
  busy?: boolean;
}) {
  const done = Boolean(preview.executed);

  const cta =
    preview.type === "swap"
      ? "Confirm & open wallet to swap"
      : preview.type === "send"
        ? "Confirm & open wallet to send"
        : preview.type === "bridge"
          ? "Confirm & open wallet to transfer"
          : "Confirm & open wallet";

  return (
    <div className="rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-blue-600/10 p-4 space-y-3 shadow-lg shadow-cyan-500/10">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-cyan-300 font-medium mb-1">
          Ready to sign · nothing sent yet
        </div>
        <div className="font-semibold text-slate-50 text-base">
          {preview.title}
        </div>
        {preview.type === "bridge" &&
          preview.fromChain &&
          preview.toChain && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
              {String(preview.fromChain).includes("Arc")
                ? "Arc"
                : String(preview.fromChain).includes("Base")
                  ? "Base"
                  : preview.fromChain}
              <span className="text-cyan-400">→</span>
              {String(preview.toChain).includes("Arc")
                ? "Arc"
                : String(preview.toChain).includes("Base")
                  ? "Base"
                  : preview.toChain}
            </div>
          )}
        <p className="text-sm text-slate-300 mt-1 leading-relaxed">
          {preview.summary}
        </p>
      </div>

      {preview.plan && preview.plan.length > 0 && (
        <ol className="space-y-1.5">
          {preview.plan.map((step, i) => (
            <li
              key={step.id}
              className="flex items-start gap-2 text-xs text-slate-300"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-[10px] font-mono text-cyan-300">
                {i + 1}
              </span>
              <span>
                {step.label}
                {step.detail && (
                  <span className="text-slate-500"> · {step.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {preview.route && preview.route.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Route className="h-3.5 w-3.5 text-cyan-400" />
          {preview.route.map((hop, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="h-3 w-3 text-slate-600" />}
              <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-slate-200">
                {hop}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {typeof preview.estimatedFeeUsd === "number" && (
          <span className="inline-flex items-center gap-1">
            <Fuel className="h-3 w-3 text-amber-300" />
            {formatUsdc(preview.estimatedFeeUsd)} gas
          </span>
        )}
        {preview.estimatedTime && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-emerald-300" />
            {preview.estimatedTime}
          </span>
        )}
        {preview.fromChain && preview.toChain && (
          <span>
            {CHAINS[preview.fromChain]?.short} →{" "}
            {CHAINS[preview.toChain]?.short}
          </span>
        )}
        {preview.requiresWallet && (
          <span className="inline-flex items-center gap-1 text-cyan-300/90">
            <Wallet className="h-3 w-3" />
            Rabby / MetaMask will pop up
          </span>
        )}
      </div>

      <Button
        size="lg"
        className="w-full text-sm font-semibold h-11"
        disabled={!preview.canExecute || done || busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onExecute();
        }}
        type="button"
      >
        {done ? (
          <>
            <Check className="h-4 w-4" />
            Executed
          </>
        ) : busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for wallet…
          </>
        ) : preview.canExecute ? (
          cta
        ) : (
          "Missing details"
        )}
      </Button>
      <p className="text-[10px] text-center text-slate-500">
        Click the button above — the agent only plans until you confirm.
      </p>
    </div>
  );
}
