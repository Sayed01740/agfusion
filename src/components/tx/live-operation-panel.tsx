"use client";

import { motion } from "framer-motion";
import { ExternalLink, Loader2, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePilotStore } from "@/store/pilot-store";
import { shortenAddress } from "@/lib/utils";
import { CHAINS } from "@/lib/chains";
import type { ChainId } from "@/types";

function explorerFor(tx: { fromChain?: ChainId; toChain?: ChainId }, hash: string) {
  const chain = tx.toChain ?? tx.fromChain;
  const base = chain ? CHAINS[chain]?.explorer : undefined;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function LiveOperationPanel() {
  const { isThinking, transactions, activeTxId } = usePilotStore();
  const tx = transactions.find((item) => item.id === activeTxId) ?? transactions[0];

  if (!isThinking) return null;

  const activeStep = tx?.steps?.find((step) => step.state === "active") ?? tx?.steps?.find((step) => step.state === "pending");
  const hash = tx?.txHash ?? tx?.steps?.find((step) => step.txHash)?.txHash;
  const explorer = hash && tx ? explorerFor(tx, hash) : undefined;

  return (
    <Card className="overflow-hidden border-cyan-400/25 bg-[#07111f] shadow-[0_12px_40px_rgba(8,145,178,0.12)]">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center gap-3">
          <motion.span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.05, ease: "linear", repeat: Infinity }}
          >
            <Loader2 className="h-4 w-4" />
          </motion.span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-semibold text-slate-100">Live operation</p>
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
                <Radio className="h-2.5 w-2.5 animate-pulse" /> Live
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-cyan-200/80">
              {activeStep?.name ?? tx?.message ?? "Processing your request…"}
            </p>
          </div>
          {tx?.amount && tx?.token && (
            <span className="hidden shrink-0 rounded-lg bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
              {tx.amount} {tx.token}
            </span>
          )}
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full w-1/3 rounded-full bg-cyan-400/80"
            animate={{ x: ["-120%", "360%"] }}
            transition={{ duration: 1.35, ease: "easeInOut", repeat: Infinity }}
          />
        </div>

        {hash && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">Transaction</span>
            {explorer ? (
              <a href={explorer} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-mono text-[10px] text-cyan-300 hover:underline">
                {shortenAddress(hash, 4)}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="font-mono text-[10px] text-slate-400">{shortenAddress(hash, 4)}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
