"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    void discoverWallets()
      .then(setWallets)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md liquid-glass rounded-2xl border border-cyan-500/20 shadow-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Connect wallet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Address only · no funds move on connect
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email) return;
              setEmailConnecting(true);
              try {
                const { authenticateWithCircleEmail } = await import("@/sdk/circle-pw");
                const { setActiveProvider } = await import("@/sdk/active-wallet");
                const { usePilotStore } = await import("@/store/pilot-store");
                const address = await authenticateWithCircleEmail(email);
                
                // For a User-Controlled Wallet, we don't have a standard window.ethereum.
                // We create a minimal mock provider so the app recognizes a wallet is connected.
                  const mockProvider = {
                    request: async (args: any) => {
                      if (args.method === "eth_accounts") return [address];
                      if (args.method === "eth_chainId") return "0x4cef52"; // 5042002 in hex
                      if (args.method === "wallet_switchEthereumChain") return null;
                      if (args.method === "wallet_addEthereumChain") return null;
                      if (args.method === "personal_sign") {
                        // Return a deterministic signature based on the address for Agent Wallet generation
                        return `0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000${address.slice(2)}`;
                      }
                      throw new Error(`Method ${args.method} not supported by Circle PW mock provider`);
                    },
                    on: () => {},
                    removeListener: () => {},
                  };
                
                setActiveProvider(mockProvider as any, {
                  uuid: "circle-pw",
                  name: "Circle Email Wallet",
                  address: address.toLowerCase(),
                });

                const { setupAgentSmartWallet } = await import("@/sdk/wallet-adapter");
                const agentProvider = await setupAgentSmartWallet(mockProvider as any, address);
                
                const agentAccounts = (await agentProvider.request({ method: "eth_accounts" })) as string[];
                const finalAddress = agentAccounts?.[0] || address;

                usePilotStore.getState().setWallet(finalAddress, 5042002);
                usePilotStore.getState().setAuthenticated(true);
                
                alert(`Connected Circle Email Wallet!\nYour Auto-Agent is ready at: ${finalAddress}\n\nPlease fund this address with USDC on Arc Testnet to use the AI workspace seamlessly.`);
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
              <label className="text-xs font-medium text-slate-400">
                Create a wallet with email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                />
                <Button
                  type="submit"
                  disabled={emailConnecting || !email}
                  className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white min-w-[100px] shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all duration-300 hover:scale-[1.02]"
                >
                  {emailConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
              <p className="text-[10px] text-slate-500">
                Powered by Circle Programmable Wallets
              </p>
            </div>
          </form>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-slate-500">or</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              Detecting wallets…
            </div>
          ) : wallets.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-amber-200/90 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                No EVM wallet detected in this browser. Install one below, then
                refresh.
              </p>
              {INSTALL_LINKS.map((w) => (
                <a
                  key={w.name}
                  href={w.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:border-cyan-500/30 transition"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      {w.name}
                    </div>
                    <div className="text-[11px] text-slate-500">{w.hint}</div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
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
                    "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300",
                    "border-white/10 bg-white/[0.03] hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]",
                    "disabled:opacity-60 disabled:hover:scale-100",
                    selectedId === w.uuid && connecting && "border-cyan-500/50",
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
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                      <Wallet className="h-4 w-4" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-100">
                      {w.name}
                    </span>
                    {w.rdns && (
                      <span className="block text-[10px] text-slate-500 truncate">
                        {w.rdns}
                      </span>
                    )}
                  </span>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  ) : (
                    <span className="text-xs text-cyan-300">Connect</span>
                  )}
                </button>
              );
            })
          )}

          {error && (
            <p className="text-xs text-red-300 whitespace-pre-wrap rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}

          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-[10px] text-slate-400 space-y-1.5">
            <div className="font-medium text-emerald-300/90">
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
            <div className="pt-1 border-t border-white/5 text-slate-500 font-mono">
              Arc Testnet · Chain ID 5042002 · RPC rpc.testnet.arc.network · USDC
              gas
            </div>
            <div className="text-slate-600">
              Network tip: if add-network fails, delete a stale “Arc Testnet” in
              wallet settings and connect again.
            </div>
          </div>

          {wallets.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
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
    </div>
  );
}
