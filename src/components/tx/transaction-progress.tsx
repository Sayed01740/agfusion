"use client";

import { motion } from "framer-motion";
import {
  Check,
  Circle,
  ExternalLink,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import type { TransactionRecord } from "@/types";
import { cn, shortenAddress } from "@/lib/utils";
import { formatUsdc, feeFromUsd } from "@/lib/fees";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TransactionProgress({
  tx,
  onRetry,
}: {
  tx: TransactionRecord;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-cyan-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="capitalize text-sm">
            {tx.type.replace("_", " ")} · {tx.amount} {tx.token}
            {tx.tokenOut ? ` → ${tx.tokenOut}` : ""}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge
              variant={
                tx.executionMode === "live" ? "cyan" : "outline"
              }
            >
              {tx.executionMode === "live" ? "Live" : "Demo"}
            </Badge>
            <Badge
              variant={
                tx.status === "success"
                  ? "success"
                  : tx.status === "error"
                    ? "warning"
                    : "cyan"
              }
            >
              {tx.status}
            </Badge>
          </div>
        </div>
        {tx.recipientLabel && (
          <p className="text-xs text-muted-foreground">
            To {tx.recipientLabel}
            {tx.recipient ? ` (${shortenAddress(tx.recipient)})` : ""}
          </p>
        )}
        {tx.message && (
          <p className="text-[11px] text-slate-500 mt-0.5">{tx.message}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {tx.steps.map((step, i) => (
            <motion.li
              key={`${step.name}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 text-sm"
            >
              <StepIcon state={step.state} />
              <span
                className={cn(
                  "flex-1",
                  step.state === "success" && "text-slate-200",
                  step.state === "active" && "text-cyan-300",
                  step.state === "pending" && "text-slate-500",
                  step.state === "error" && "text-red-300",
                )}
              >
                {step.name}
                {step.message && (
                  <span className="block text-[10px] text-slate-500">
                    {step.message}
                  </span>
                )}
              </span>
              {step.txHash && (
                <span className="font-mono text-[10px] text-slate-500">
                  {shortenAddress(step.txHash, 3)}
                </span>
              )}
            </motion.li>
          ))}
        </ol>
        {typeof tx.feeUsd === "number" && (
          <FeeLineItems quote={feeFromUsd(tx.feeUsd)} compact />
        )}
        <div className="text-xs text-muted-foreground border-t border-white/5 pt-3 flex flex-wrap items-center justify-between gap-2">
          {typeof tx.feeUsd === "number" ? (
            <span className="tabular-nums">
              Gas line ·{" "}
              <span className="text-slate-300">{formatUsdc(tx.feeUsd)}</span>
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {tx.explorerUrl && tx.txHash && (
              <a
                href={
                  tx.explorerUrl.includes("/tx/")
                    ? tx.explorerUrl
                    : `${tx.explorerUrl}/tx/${tx.txHash}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {(tx.status === "error" || tx.retryable) && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} type="button">
                <RotateCcw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepIcon({ state }: { state: string }) {
  if (state === "success")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (state === "active")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  if (state === "error")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-400">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-slate-600">
      <Circle className="h-3 w-3" />
    </span>
  );
}
