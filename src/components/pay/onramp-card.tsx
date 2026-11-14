"use client";

import { useRef, useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePilotStore } from "@/store/pilot-store";
import { getAppKit } from "@/sdk/appkit-client";

export function OnrampCard({ embedded = false }: { embedded?: boolean }) {
  const { walletAddress } = usePilotStore();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"popup" | "inline">("popup");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeHostRef = useRef<HTMLDivElement>(null);

  async function launchOnramp() {
    if (!walletAddress) {
      setError("Connect your wallet first so purchased USDC lands in your address.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/circle/onramp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationAddress: walletAddress }),
      });
      const session = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          session?.error ||
            "Could not start Circle Onramp session. Check server CIRCLE_API_KEY configuration.",
        );
      }

      const kit = await getAppKit();
      if (!kit?.onramp) {
        throw new Error("Circle App Kit Onramp module is unavailable in this browser.");
      }

      if (mode === "popup" && typeof kit.onramp.openWindow === "function") {
        await kit.onramp.openWindow({ session });
        setStatus("Circle Onramp opened in a secure window.");
      } else if (typeof kit.onramp.mountIframe === "function" && iframeHostRef.current) {
        iframeHostRef.current.innerHTML = "";
        await kit.onramp.mountIframe({
          container: iframeHostRef.current,
          session,
        });
        setStatus("Circle Onramp widget loaded below.");
      } else {
        throw new Error("Circle Onramp launcher is not available.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onramp launch failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "space-y-3" : "rounded-2xl border border-border bg-card p-4 space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard aria-hidden="true" className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold text-foreground">
            Buy USDC with Fiat (Circle Onramp)
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">
          Card · Apple Pay · Bank
        </Badge>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Fund your connected wallet directly with fiat via Circle&apos;s hosted Onramp widget.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("popup")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mode === "popup" ? "bg-card text-foreground font-semibold" : "text-muted-foreground"
            }`}
          >
            Popup
          </button>
          <button
            type="button"
            onClick={() => setMode("inline")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mode === "inline" ? "bg-card text-foreground font-semibold" : "text-muted-foreground"
            }`}
          >
            Inline
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={busy || !walletAddress}
          onClick={launchOnramp}
          className="ml-auto bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 mr-1" />
          )}
          {walletAddress ? "Buy USDC" : "Connect Wallet First"}
        </Button>
      </div>

      {status && (
        <p className="text-[11px] text-emerald-400 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5">
          {status}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-danger rounded-lg border border-danger/20 bg-danger/10 px-2.5 py-1.5">
          {error}
        </p>
      )}

      <div
        ref={iframeHostRef}
        className={mode === "inline" && status ? "min-h-[520px] w-full rounded-xl overflow-hidden border border-border" : "hidden"}
      />
    </div>
  );
}
