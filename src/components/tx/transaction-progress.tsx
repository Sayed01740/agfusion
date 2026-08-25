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
import { CHAINS } from "@/lib/chains";

function isDestinationStep(name: string): boolean {
  const normalized = name.toLowerCase();
  return ["mint", "receive", "destination", "deposit"].some((key) =>
    normalized.includes(key),
  );
}

function getStepExplorerUrl(tx: TransactionRecord, stepName: string, txHash: string): string | null {
  const chain = isDestinationStep(stepName) ? tx.toChain : tx.fromChain;
  const explorer = chain ? CHAINS[chain]?.explorer : undefined;
  return explorer ? `${explorer}/tx/${txHash}` : null;
}

function getTransactionExplorerUrl(tx: TransactionRecord): string | null {
  if (!tx.txHash) return null;

  if (tx.type === "bridge") {
    const destinationChain = tx.toChain ?? tx.bridgeState?.toChain;
    const destinationHash = tx.bridgeState?.destinationTxHash ?? tx.txHash;
    const explorer = destinationChain ? CHAINS[destinationChain]?.explorer : undefined;
    if (explorer && destinationHash) return `${explorer}/tx/${destinationHash}`;
  }

  if (tx.explorerUrl) {
    return tx.explorerUrl.includes("/tx/")
      ? tx.explorerUrl
      : `${tx.explorerUrl}/tx/${tx.txHash}`;
  }

  const chain = tx.toChain ?? tx.fromChain;
  const explorer = chain ? CHAINS[chain]?.explorer : undefined;
  return explorer ? `${explorer}/tx/${tx.txHash}` : null;
}

export function TransactionProgress({
  tx,
  onRetry,
}: {
  tx: TransactionRecord;
  onRetry?: () => void;
}) {
  const transactionExplorerUrl = getTransactionExplorerUrl(tx);

  return (
    <Card className="border-cyan-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="capitalize text-sm">
            {tx.type.replace("_", " ")} · {tx.amount} {tx.token}
            {tx.tokenOut ? ` → ${tx.tokenOut}` : ""}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant={tx.executionMode === "live" ? "cyan" : "outline"}>
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
        {tx.message && <p className="mt-0.5 text-[11px] text-slate-500">{tx.message}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {tx.steps.map((step, i) => {
            const stepExplorerUrl = step.txHash
              ? getStepExplorerUrl(tx, step.name, step.txHash)
              : null;
            return (
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
                    <span className="block text-[10px] text-slate-500">{step.message}</span>
                  )}
                </span>
                {step.txHash && stepExplorerUrl ? (
                  <a
                    href={stepExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[120px] truncate font-mono text-[10px] text-cyan-400/80 underline hover:text-cyan-300"
                    title={`${step.name} transaction`}
                  >
                    {shortenAddress(step.txHash, 3)}
                  </a>
                ) : step.txHash ? (
                  <span className="font-mono text-[10px] text-slate-500">{shortenAddress(step.txHash, 3)}</span>
                ) : null}
              </motion.li>
            );
          })}
        </ol>
        {typeof tx.feeUsd === "number" && <FeeLineItems quote={feeFromUsd(tx.feeUsd)} compact />}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-muted-foreground">
          {typeof tx.feeUsd === "number" ? (
            <span className="tabular-nums">
              Gas line · <span className="text-slate-300">{formatUsdc(tx.feeUsd)}</span>
            </span>
          ) : <span />}
          <div className="flex gap-2">
            {transactionExplorerUrl && (
              <a
                href={transactionExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {(tx.status === "error" || tx.retryable) && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} type="button">
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepIcon({ state }: { state: string }) {
  if (state === "success") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (state === "active") {
    return (
      <motion.span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.85, ease: "linear", repeat: Infinity }}
        aria-label="In progress"
      >
        <Loader2 className="h-3.5 w-3.5" />
      </motion.span>
    );
  }

  if (state === "error") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-400">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-slate-600">
      <Circle className="h-3 w-3" />
    </span>
  );
}
