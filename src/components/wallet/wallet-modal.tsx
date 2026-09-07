"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  discoverWallets,
  type DiscoveredWallet,
} from "@/sdk/wallet-adapter";
import { cn } from "@/lib/utils";

const INSTALL_LINKS = [
  {
    name: "MetaMask",
    url: "https://metamask.io/download/",
    hint: "Most common",
  },
  {
    name: "Rabby",
    url: "https://rabby.io/",
    hint: "Multi-chain friendly",
  },
  {
    name: "Coinbase Wallet",
    url: "https://www.coinbase.com/wallet/downloads",
    hint: "Easy onboarding",
  },
  {
    name: "Brave Wallet",
    url: "https://brave.com/wallet/",
    hint: "Built into Brave",
  },
];

export function WalletModal({
  open,
  onClose,
  onSelect,
  connecting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (wallet: DiscoveredWallet) => void;
  connecting?: boolean;
  error?: string | null;
}) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailConnecting, setEmailConnecting] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const busy = Boolean(connecting || emailConnecting);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    void discoverWallets()
      .then(setWallets)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <ModalDialog open={open} onDismiss={onClose} busy={busy} labelledBy={titleId} describedBy={summaryId} initialFocusRef={titleRef}>
      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className="rounded text-base font-semibold text-foreground">
              Connect wallet
            </h2>
            <p id={summaryId} className="text-xs text-muted-foreground mt-0.5">
              Address only · no funds move on connect
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close wallet connection dialog"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4 scrollbar-thin">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email) return;
              setEmailConnecting(true);
              try {
                const { authenticateWithCircleEmail, createCircleMockProvider } = await import("@/sdk/circle-pw");
                const { setActiveProvider } = await import("@/sdk/active-wallet");
                const { usePilotStore } = await import("@/store/pilot-store");
                const { address } = await authenticateWithCircleEmail(email);

                // For a User-Controlled Wallet, we don't have a standard window.ethereum.
                // Build the shared mock provider so the app recognizes a wallet is
                // connected AND so it can be reconstructed after a page reload.
                const chainIdRef = { value: "0x4cef52" }; // Arc Testnet = 5042002
                const { provider: mockProvider } = createCircleMockProvider({
                  address,
                  chainIdRef,
                });

                setActiveProvider(mockProvider as any, {
                  uuid: "circle-pw",
                  name: "Circle Email Wallet",
                  address: address.toLowerCase(),
                  smartAccountAddress: address.toLowerCase(),
                });
                usePilotStore.getState().setWalletType("circle");

                // A Circle user-controlled wallet is already the user's funded wallet.
                // Do not wrap it in a ZeroDev account here: that creates a second address,
                // so the UI would check the smart account while the faucet funds remain in
                // the Circle wallet.
                usePilotStore.getState().setWallet(address, 5042002);
                usePilotStore.getState().setAuthenticated(true);
                
                alert(`Connected Circle Email Wallet!\nYour wallet address is: ${address}\n\nFund this exact address with USDC on Arc Testnet. This same Circle smart-wallet address can be used by Auto-Agent.`);
                onClose();
              } catch (err: any) {
                alert(err.message || "Failed to create Circle Wallet");
              } finally {
                setEmailConnecting(false);
              }
            }}
            className="space-y-3"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor={emailId} className="text-xs font-medium text-muted-foreground">
                Create a wallet with email
              </label>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <input
                  id={emailId}
                  name="email"
                  autoComplete="email"
                  aria-describedby={emailHintId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <Button
                  type="submit"
                  disabled={emailConnecting || !email}
                  aria-label={emailConnecting ? "Connecting email wallet" : undefined}
                  className="min-h-11 min-w-[100px] border-accent bg-accent bg-none text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent motion-reduce:transition-none motion-reduce:transform-none"
                >
                  {emailConnecting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : "Continue"}
                </Button>
              </div>
              <p id={emailHintId} className="text-[10px] text-muted-foreground">
                Powered by Circle Programmable Wallets
              </p>
            </div>
          </form>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-muted-foreground">or</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none" />
              Detecting wallets…
            </div>
          ) : wallets.length === 0 ? (
            <div className="space-y-3 py-2">
              <p role="status" className="text-sm text-warning rounded-xl border border-warning/20 bg-warning/10 px-3 py-2">
                No EVM wallet detected in this browser. Install one below, then
                refresh.
              </p>
              {INSTALL_LINKS.map((w) => (
                <a
                  key={w.name}
                  href={w.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-muted px-4 py-3 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {w.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{w.hint}</div>
                  </div>
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          ) : (
            wallets.map((w) => {
              const busy = connecting && selectedId === w.uuid;
              return (
                <button
                  key={w.uuid}
                  type="button"
                  disabled={connecting}
                  onClick={() => {
                    setSelectedId(w.uuid);
                    onSelect(w);
                  }}
                  className={cn(
                    "min-h-11 w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    "border-border bg-muted hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                    "disabled:opacity-60",
                    selectedId === w.uuid && connecting && "border-accent/50",
                  )}
                >
                  {w.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.icon}
                      alt=""
                      className="h-9 w-9 rounded-xl bg-white/5 object-contain p-1"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <Wallet aria-hidden="true" className="h-4 w-4" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {w.name}
                    </span>
                    {w.rdns && (
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {w.rdns}
                      </span>
                    )}
                  </span>
                  {busy ? (
                    <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none" /><span className="sr-only">Connecting</span></>
                  ) : (
                    <span className="text-xs text-accent">Connect</span>
                  )}
                </button>
              );
            })
          )}

          <p role="status" className="sr-only">{emailConnecting ? "Connecting email wallet. Complete the sign-in prompt." : connecting ? "Connecting wallet. Check your wallet for a connection request." : ""}</p>

          {error && (
            <p role="alert" className="text-xs text-danger whitespace-pre-wrap rounded-xl border border-danger/20 bg-danger/10 px-3 py-2">
              {error}
            </p>
          )}

          <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-[10px] text-muted-foreground space-y-1.5">
            <div className="font-medium text-accent">
              Security notes
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                Connecting only reveals your public address. AGFusion never asks
                for your seed phrase.
              </li>
              <li>
                Sign-in (later) uses a standard login message — not a transfer or
                token approval. Your wallet should not show a risk warning for a
                normal SIWE sign-in.
              </li>
              <li>
                Reject any prompt that tries to send assets or set unlimited
                allowances during connect.
              </li>
            </ul>
            <div className="pt-1 border-t border-border text-muted-foreground font-mono break-words">
              Arc Testnet · Chain ID 5042002 · RPC rpc.testnet.arc.network · USDC
              gas
            </div>
            <div className="text-muted-foreground">
              Network tip: if add-network fails, delete a stale “Arc Testnet” in
              wallet settings and connect again.
            </div>
          </div>

          {wallets.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 w-full text-xs text-foreground focus-visible:ring-accent motion-reduce:transition-none motion-reduce:transform-none"
              type="button"
              onClick={() => {
                setLoading(true);
                void discoverWallets()
                  .then(setWallets)
                  .finally(() => setLoading(false));
              }}
            >
              Refresh wallet list
            </Button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
