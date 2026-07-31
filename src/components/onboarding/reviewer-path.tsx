"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGFUSION_X_URL } from "@/lib/social";
import {
  AGFUSION_DEPLOYER,
  AGFUSION_REGISTRY,
  registryExplorerUrl,
  txExplorerUrl,
  walletExplorerUrl,
} from "@/lib/onchain";

const STEPS = [
  "Connect wallet → Arc Testnet",
  "Free USDC from faucet.circle.com (Arc Testnet)",
  "Payment Engine: send 0.05 USDC to your other address",
  "Chat: “Show my balances” or “Swap 1 USDC to EURC”",
  "Optional: Bridge a small amount Arc ↔ Base",
];

/**
 * Short checklist — clear for normal users and Arc reviewers.
 */
export function ReviewerPathCard() {
  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.07] to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          Quick checklist (5 minutes)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-slate-400">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Do these in order the first time. Use <strong className="text-slate-400">test</strong>{" "}
          money only.
        </p>
        <ol className="space-y-1.5 list-decimal list-inside text-slate-300">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
          Always paste a full <code className="text-cyan-300/90">0x…</code> address
          for sends (42 characters). Cancel any wallet popup you did not start.
        </p>
        <div className="rounded-lg border border-white/10 bg-slate-950/50 p-2.5 space-y-1 font-mono text-[10px] text-slate-400">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400/80 font-sans">
            On-chain identity (Arc Testnet)
          </div>
          <div>
            Registry:{" "}
            <a
              href={registryExplorerUrl()}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:underline break-all"
            >
              {AGFUSION_REGISTRY}
            </a>
          </div>
          <div>
            Owner:{" "}
            <a
              href={walletExplorerUrl()}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:underline break-all"
            >
              {AGFUSION_DEPLOYER}
            </a>
          </div>
          <a
            href={txExplorerUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-sans"
          >
            Deploy tx on ArcScan <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            Faucet <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            ArcScan <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={AGFUSION_X_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            X @AGfusion_ <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://docs.arc.io"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            Arc docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
