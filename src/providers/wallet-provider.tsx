"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatEther, type Address } from "viem";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { ARC_CHAIN_ID, arcTestnet } from "@/lib/arc-chain";
import {
  connectWallet,
  disconnectActiveWallet,
  discoverWallets,
  getInjectedProvider,
  getStoredWalletName,
  switchToArcTestnet,
  type DiscoveredWallet,
  type InjectedProvider,
} from "@/sdk/wallet-adapter";
import { setActiveProvider } from "@/sdk/active-wallet";
import { usePilotStore } from "@/store/pilot-store";
import { isAppKitInstalled } from "@/sdk/appkit-client";
import { WalletModal } from "@/components/wallet/wallet-modal";

type WalletContextValue = {
  connecting: boolean;
  signingIn: boolean;
  authenticated: boolean;
  appKitReady: boolean | null;
  walletName: string | null;
  /** Opens multi-wallet picker */
  openConnectModal: () => void;
  /** Connect specific discovered wallet */
  connectWith: (wallet: DiscoveredWallet) => Promise<void>;
  /** Quick connect: first available or open modal if multiple */
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToArc: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  signInSiwe: () => Promise<boolean>;
  error: string | null;
  clearError: () => void;
  enableAgentMode: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const {
    setWallet,
    setLiveBalance,
    walletAddress,
    hydrate,
    setAuthenticated,
    loadServerTransactions,
    refreshBalances,
  } = usePilotStore();
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authenticated, setAuthLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appKitReady, setAppKitReady] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<InjectedProvider | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    hydrate();
    isAppKitInstalled().then(setAppKitReady);
    const storedName = getStoredWalletName();
    if (storedName) setWalletName(storedName);

    // Restore a persisted Circle Email Wallet session (Phase 4) so the mock
    // provider can be rebuilt after reload instead of living only in the modal.
    void import("@/sdk/circle-pw")
      .then(async (mod) => {
        const restored = await mod.restoreCircleSession();
        if (restored) {
          setActiveProvider(restored.provider as never, {
            uuid: "circle-pw",
            name: "Circle Email Wallet",
            address: restored.address.toLowerCase(),
          });
          setProvider(restored.provider as never);
          setWallet(restored.address, ARC_CHAIN_ID);
          setWalletName("Circle Email Wallet");
          usePilotStore.getState().setWalletType("circle");
          usePilotStore.getState().setAuthenticated(true);
          return;
        }
        // No Circle session — rebind sticky EVM provider after refresh
        const p = await getInjectedProvider();
        setProvider(p);
        usePilotStore.getState().setWalletType("evm");
        try {
          const accs = (await p.request({ method: "eth_accounts" })) as string[];
          if (accs?.[0]) {
            setWallet(accs[0], ARC_CHAIN_ID);
            setActiveProvider(p, {
              uuid: "restored",
              name: storedName || "Wallet",
              address: accs[0].toLowerCase(),
            });
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        usePilotStore.getState().setWalletType("evm");
      });

    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const ok = Boolean(d.authenticated);
        setAuthLocal(ok);
        setAuthenticated(ok);
        if (d.user?.address) {
          setWallet(d.user.address, ARC_CHAIN_ID);
          void loadServerTransactions(d.user.address);
        }
      })
      .catch(() => {});
  }, [hydrate, setAuthenticated, setWallet, loadServerTransactions]);

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) {
      setLiveBalance(null);
      return;
    }
    try {
      // Route browser reads through the same-origin /api/rpc proxy so a flaky
      // or CORS-blocked public RPC can never surface as "Network connection
      // failed for Arc Testnet" on the balance card.
      void import("@/lib/circle-proxy").then((m) => m.installCircleApiProxy());
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http(
          typeof window !== "undefined"
            ? `${window.location.origin}/api/rpc?chain=arc`
            : arcTestnet.rpcUrls.default.http[0],
        ),
      });
      const bal = await client.getBalance({
        address: walletAddress as Address,
      });
      setLiveBalance(formatEther(bal));
      // Sync unified balance card + analytics
      refreshBalances();
    } catch {
      try {
        const res = await fetch(
          `/api/balances?address=${encodeURIComponent(walletAddress)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const amt = data?.balances?.[0]?.amount ?? data?.totalUsd;
          if (amt != null) setLiveBalance(String(amt));
        }
      } catch {
        /* ignore */
      }
      refreshBalances();
    }
  }, [walletAddress, setLiveBalance, refreshBalances]);

  // Live data: fetch on connect, then poll on-chain balance + server history
  // every 15s while a wallet is connected so the UI reflects new sends/bridges
  // without a manual refresh.
  useEffect(() => {
    if (!walletAddress) return;
    void refreshBalance();
    void usePilotStore.getState().loadServerTransactions(walletAddress);
    const id = window.setInterval(() => {
      void refreshBalance();
      void usePilotStore.getState().loadServerTransactions(walletAddress);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [walletAddress, refreshBalance]);

  const attachListeners = useCallback(
    (p: InjectedProvider, address: string) => {
      const onAccounts = (...args: unknown[]) => {
        const accs = args[0] as string[] | undefined;
        if (!accs?.length) {
          setWallet(null, null);
          setLiveBalance(null);
          setAuthLocal(false);
          setAuthenticated(false);
          setWalletName(null);
        } else {
          setWallet(accs[0], ARC_CHAIN_ID);
        }
      };
      const onChain = (...args: unknown[]) => {
        const hex = String(args[0] || "0x0");
        const id = parseInt(hex, 16);
        // Keep current account; update chain id from wallet event
        const addr =
          usePilotStore.getState().walletAddress || address;
        setWallet(addr, Number.isFinite(id) ? id : null);
      };
      p.on?.("accountsChanged", onAccounts);
      p.on?.("chainChanged", onChain);
    },
    [setWallet, setLiveBalance, setAuthenticated],
  );

  /**
   * EIP-4361 SIWE via personal_sign only.
   * Never eth_sign / never a transaction — wallets show a clean sign-in UI
   * when the message is well-formed and the domain matches the site.
   */
  const trySiwe = useCallback(
    async (address: string, p: InjectedProvider) => {
      try {
        // Align chain with SIWE Chain ID so wallets don't flag a mismatch
        try {
          await switchToArcTestnet(p);
          setWallet(address, ARC_CHAIN_ID);
        } catch {
          /* user can still sign; chain switch is best-effort */
        }

        const nonceRes = await fetch(
          `/api/auth/nonce?address=${encodeURIComponent(address)}`,
          { credentials: "same-origin" },
        );
        if (!nonceRes.ok) return false;
        const data = (await nonceRes.json()) as {
          message?: string;
          meta?: { statement?: string };
        };
        const message = data.message;
        if (!message || typeof message !== "string") return false;

        // Guard: only allow EIP-4361-looking messages from our API
        if (!message.includes("wants you to sign in with your Ethereum account:")) {
          return false;
        }
        if (
          !message.includes(
            "will not trigger a blockchain transaction or cost any fees",
          )
        ) {
          return false;
        }

        const walletClient = createWalletClient({
          account: address as Address,
          chain: arcTestnet,
          transport: custom(p as never),
        });

        // viem signMessage → personal_sign (NOT eth_sign — eth_sign is high-risk)
        const signature = await walletClient.signMessage({
          account: address as Address,
          message,
        });

        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ message, signature }),
        });
        if (!verifyRes.ok) return false;
        setAuthLocal(true);
        setAuthenticated(true);
        await loadServerTransactions(address);
        return true;
      } catch {
        return false;
      }
    },
    [setAuthenticated, loadServerTransactions, setWallet],
  );

  const enableAgentMode = useCallback(async () => {
    if (!provider || !walletAddress) {
      setError("Connect a wallet first before enabling Auto-Agent.");
      return;
    }
    // Security: Circle Email Wallets cannot securely derive an agent signing
    // key (the mock provider returns a deterministic signature that anyone
    // could recompute from the public address). Disable Auto-Agent for them.
    if (usePilotStore.getState().walletType === "circle") {
      setError(
        "Auto-Agent is not available for Circle Email Wallets (an agent key cannot be securely derived for this wallet type). Connect a browser wallet such as Rabby to enable Auto-Agent.",
      );
      return;
    }
    try {
      setConnecting(true);
      const { setupAgentSmartWallet } = await import("@/sdk/wallet-adapter");
      const agentProvider = await setupAgentSmartWallet(provider, walletAddress);
      
      setProvider(agentProvider);
      
      // Update UI with the new smart account address
      const accounts = (await agentProvider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.[0]) {
        setWallet(accounts[0], ARC_CHAIN_ID);
        attachListeners(agentProvider, accounts[0]);
        alert(
          "Auto-Agent enabled successfully! Your autonomous smart account is ready.\n\n" +
          "IMPORTANT: Since the agent signs automatically without Rabby, it has its own unique address. " +
          "You must transfer some USDC on Arc Testnet to this new address before the Agent can swap for you."
        );
      }
    } catch (e: any) {
      console.error("[AGFusion] Auto-Agent setup failed:", e);
      alert("Error enabling Auto-Agent: " + (e.message || "Unknown error"));
      setError(e.message || "Failed to enable agent mode.");
    } finally {
      setConnecting(false);
    }
  }, [provider, walletAddress, setWallet, attachListeners]);

  const connectWith = useCallback(
    async (wallet: DiscoveredWallet) => {
      setConnecting(true);
      setError(null);
      try {
        // connectWallet sets sticky active wallet (Rabby stays Rabby for send/bridge)
        const { address, chainId, provider: p } = await connectWallet(wallet);
        setProvider(p);
        setWalletName(wallet.name);
        setWallet(address, chainId || ARC_CHAIN_ID);
        usePilotStore.getState().setWalletType("evm");
        attachListeners(p, address);
        setModalOpen(false);

        // Connect only — never auto-prompt SIWE
        void refreshBalance();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to connect wallet";
        setError(msg);
      } finally {
        setConnecting(false);
      }
    },
    [setWallet, attachListeners, refreshBalance],
  );

  const openConnectModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    // Always show picker so user can choose among multiple wallets
    const wallets = await discoverWallets();
    if (wallets.length === 0) {
      setModalOpen(true);
      setError(
        "No wallet found. Install MetaMask, Rabby, Coinbase Wallet, or Brave.",
      );
      return;
    }
    if (wallets.length === 1) {
      await connectWith(wallets[0]);
      return;
    }
    setModalOpen(true);
  }, [connectWith]);

  const signInSiwe = useCallback(async (): Promise<boolean> => {
    if (!walletAddress) {
      setError("Connect wallet first");
      return false;
    }
    setSigningIn(true);
    setError(null);
    try {
      const p = provider || (await getInjectedProvider());
      const ok = await trySiwe(walletAddress, p);
      if (!ok) {
        throw new Error(
          "Sign-in cancelled or failed. You only sign a login message — no funds move.",
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [walletAddress, provider, trySiwe]);

  const disconnect = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST" });
    void import("@/sdk/circle-pw").then((mod) => mod.clearCircleSession());
    disconnectActiveWallet();
    // Wipe this session's history + balances so a previous user's data never
    // remains on screen after disconnect.
    usePilotStore.getState().clearTransactions();
    setProvider(null);
    setWallet(null, null);
    setLiveBalance(null);
    setAuthLocal(false);
    setAuthenticated(false);
    setWalletName(null);
    setError(null);
    usePilotStore.getState().setWalletType("evm");
  }, [setWallet, setLiveBalance, setAuthenticated]);

  const switchToArc = useCallback(async () => {
    setError(null);
    try {
      const p = provider || (await getInjectedProvider());
      await switchToArcTestnet(p);
      if (walletAddress) setWallet(walletAddress, ARC_CHAIN_ID);
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch network");
    }
  }, [provider, walletAddress, setWallet, refreshBalance]);

  const value = useMemo(
    () => ({
      connecting,
      signingIn,
      authenticated,
      appKitReady,
      walletName,
      openConnectModal,
      connectWith,
      connect,
      disconnect,
      switchToArc,
      refreshBalance,
      signInSiwe,
      error,
      clearError: () => setError(null),
      enableAgentMode,
    }),
    [
      connecting,
      signingIn,
      authenticated,
      appKitReady,
      walletName,
      openConnectModal,
      connectWith,
      connect,
      disconnect,
      switchToArc,
      refreshBalance,
      signInSiwe,
      error,
      enableAgentMode,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setError(null);
        }}
        onSelect={(w) => void connectWith(w)}
        connecting={connecting}
        error={error}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
