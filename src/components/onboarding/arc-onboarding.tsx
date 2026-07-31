"use client";

import { useState } from "react";
import {
  ChevronDown,
  Droplets,
  ExternalLink,
  Network,
  Shield,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/providers/wallet-provider";
import { usePilotStore } from "@/store/pilot-store";
import {
  ARC_CHAIN_ID,
  ARC_CURRENCY_SYMBOL,
  ARC_EXPLORER,
  ARC_FAUCET_URL,
  ARC_NETWORK_NAME,
  ARC_TESTNET_RPC,
} from "@/lib/arc-chain";

export function ArcOnboarding() {
  const {
    openConnectModal,
    connect,
    connecting,
    switchToArc,
    error,
    authenticated,
    signInSiwe,
    signingIn,
    walletName,
  } = useWallet();
  const { walletAddress, walletChainId, liveBalanceUsdc } = usePilotStore();
  const onArc = walletChainId === ARC_CHAIN_ID;
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Card className="border-cyan-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4 text-cyan-400" />
            Get started
          </CardTitle>
          <Badge
            variant={
              walletAddress && onArc && authenticated
                ? "success"
                : walletAddress && onArc
                  ? "cyan"
                  : "outline"
            }
          >
            {walletAddress && onArc && authenticated
              ? "Secure session"
              : walletAddress && onArc
                ? "Connected"
                : walletAddress
                  ? "Switch network"
                  : "Connect required"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300 font-medium">Step 1 of using AGFusion:</strong>{" "}
          connect a browser wallet (Rabby recommended). This only shares your public
          address. Never share seed phrases or private keys.
        </p>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-emerald-100/90 space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Safe connection &amp; sign-in
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-emerald-100/75">
            <li>
              <strong className="font-medium text-emerald-200/90">Connect</strong>{" "}
              only shares your public address — no funds move.
            </li>
            <li>
              <strong className="font-medium text-emerald-200/90">Sign in</strong>{" "}
              is a login message (EIP-4361). Not a transaction. No gas. No
              approvals.
            </li>
            <li>
              Your wallet should show a normal{" "}
              <em>Sign-in request</em>, not a transfer or contract call.
            </li>
          </ul>
        </div>

        <ol className="space-y-2 text-xs text-slate-400">
          <li className="flex gap-2">
            <span className="text-cyan-400 font-mono">1</span>
            Connect a browser wallet
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400 font-mono">2</span>
            Switch to Arc Testnet (USDC gas)
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400 font-mono">3</span>
            Optional: Sign in for a secure session (message only)
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400 font-mono">4</span>
            Fund test USDC, then send or use the agent
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          {!walletAddress ? (
            <>
              <Button
                size="sm"
                onClick={() => openConnectModal()}
                disabled={connecting}
              >
                <Wallet className="h-3.5 w-3.5" />
                {connecting ? "Connecting…" : "Connect wallet"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void connect()}
                disabled={connecting}
              >
                Quick connect
              </Button>
            </>
          ) : !onArc ? (
            <Button size="sm" onClick={() => void switchToArc()}>
              <Network className="h-3.5 w-3.5" />
              Switch to Arc
            </Button>
          ) : (
            <Badge variant="success" className="gap-1">
              <Shield className="h-3 w-3" />
              {walletName || "Connected"}
              {liveBalanceUsdc
                ? ` · ${Number(liveBalanceUsdc).toFixed(4)} ${ARC_CURRENCY_SYMBOL}`
                : ""}
            </Badge>
          )}
          {walletAddress && !authenticated && (
            <Button
              size="sm"
              variant="secondary"
              disabled={signingIn}
              onClick={() => void signInSiwe()}
              title="EIP-4361 login message only — no transaction, no fees"
            >
              {signingIn ? "Waiting for wallet…" : "Sign in (message only)"}
            </Button>
          )}
          {authenticated && (
            <Badge variant="cyan" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Signed in securely
            </Badge>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href={ARC_FAUCET_URL} target="_blank" rel="noreferrer">
              <Droplets className="h-3.5 w-3.5" />
              Faucet
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </Button>
        </div>

        {walletAddress && !authenticated && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            When you tap Sign in, your wallet opens a{" "}
            <span className="text-slate-400">personal_sign / SIWE</span> prompt.
            Reject anything that asks to send assets, approve tokens, or
            unlimited spending.
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition ${showAdvanced ? "rotate-180" : ""}`}
          />
          Network details (only if needed)
        </button>

        {showAdvanced && (
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 font-mono text-[11px] text-slate-400 space-y-1">
            <div>
              Network: <span className="text-slate-300">{ARC_NETWORK_NAME}</span>
            </div>
            <div>
              Chain ID: <span className="text-slate-300">{ARC_CHAIN_ID}</span>
            </div>
            <div className="break-all">
              RPC: <span className="text-slate-300">{ARC_TESTNET_RPC}</span>
            </div>
            <div className="break-all">
              Explorer:{" "}
              <a
                href={ARC_EXPLORER}
                className="text-cyan-400 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                ArcScan
              </a>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-300 whitespace-pre-wrap">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
