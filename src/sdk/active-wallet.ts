/**
 * Session-sticky active wallet provider.
 * Keeps Circle Smart Wallet and injected EVM wallets strictly separated so an
 * installed MetaMask can never steal a Circle signing flow.
 */

import type { DiscoveredWallet, InjectedProvider } from "@/sdk/wallet-adapter";

const STORAGE_KEY = "agfusion_active_wallet_v1";
const CIRCLE_META_KEY = "agfusion_circle_wallet_meta_v1";

type WalletRpcConfig = {
  name: string;
  rpc: string;
  explorer: string;
  currency: { name: string; symbol: string; decimals: number };
  key: string;
};

export type ActiveWalletMeta = {
  uuid: string;
  name: string;
  rdns?: string;
  address?: string;
  smartAccountAddress?: string;
  walletType?: string;
  chainId?: string | number;
};

let activeProvider: InjectedProvider | null = null;
let activeMeta: ActiveWalletMeta | null = null;

function loadMeta(): ActiveWalletMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveWalletMeta;
  } catch {
    return null;
  }
}

function loadCircleMeta(): ActiveWalletMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CIRCLE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string; uuid?: string; wallets?: Array<{ address?: string; blockchain?: string }> };
    if (parsed?.uuid !== "circle-pw") return null;
    const arc = parsed.wallets?.find((w) => w.blockchain === "ARC-TESTNET");
    if (!arc?.address) return null;
    return { uuid: "circle-pw", name: "Circle Email Wallet", address: arc.address.toLowerCase(), walletType: "circle", chainId: "Arc_Testnet" };
  } catch {
    return null;
  }
}

function saveMeta(meta: ActiveWalletMeta | null) {
  if (typeof window === "undefined") return;
  try {
    if (!meta) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch { /* ignore */ }
}

function clearCircleSelectionMarker() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CIRCLE_META_KEY);
    sessionStorage.removeItem("agfusion_circle_session_v1");
  } catch { /* ignore */ }
}

function wrapWalletRpcGuard(provider: InjectedProvider, meta: ActiveWalletMeta): InjectedProvider {
  if (typeof window === "undefined") return provider;
  if (meta.uuid === "circle-pw" || !!meta.smartAccountAddress) return provider;
  const origin = window.location.origin;
  const chainRpc: Record<string, WalletRpcConfig> = {
    "0x4cef52": { name: "Arc Testnet", rpc: `${origin}/api/rpc?chain=arc`, explorer: "https://testnet.arcscan.app", currency: { name: "USDC", symbol: "USDC", decimals: 18 }, key: "arc" },
    "0x14a34": { name: "Base Sepolia", rpc: `${origin}/api/rpc?chain=base`, explorer: "https://sepolia.basescan.org", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "base" },
    "0xaa36a7": { name: "Ethereum Sepolia", rpc: `${origin}/api/rpc?chain=eth`, explorer: "https://sepolia.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "eth" },
    "0x66eee": { name: "Arbitrum Sepolia", rpc: `${origin}/api/rpc?chain=arb`, explorer: "https://sepolia.arbiscan.io", currency: { name: "Ether", symbol: "Ether", decimals: 18 }, key: "arb" },
    "0xaa37dc": { name: "OP Sepolia", rpc: `${origin}/api/rpc?chain=op`, explorer: "https://sepolia-optimism.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "op" },
    "0x13882": { name: "Polygon Amoy", rpc: `${origin}/api/rpc?chain=polygon`, explorer: "https://amoy.polygonscan.com", currency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, key: "polygon" },
    "0xa869": { name: "Avalanche Fuji", rpc: `${origin}/api/rpc?chain=avax`, explorer: "https://testnet.snowtrace.io", currency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, key: "avax" },
    "0x515": { name: "Unichain Sepolia", rpc: `${origin}/api/rpc?chain=unichain`, explorer: "https://sepolia.uniscan.xyz", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "unichain" },
    "0xe705": { name: "Linea Sepolia", rpc: `${origin}/api/rpc?chain=linea`, explorer: "https://sepolia.lineascan.build", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "linea" },
  };
  const originalRequest = provider.request.bind(provider);
  const currentChainConfig = async (): Promise<WalletRpcConfig | null> => {
    try { return chainRpc[String(await originalRequest({ method: "eth_chainId" }) ?? "").toLowerCase()] ?? null; } catch { return null; }
  };
  const proxyNonce = async (cfg: WalletRpcConfig, address: string): Promise<string | null> => {
    try {
      const response = await fetch(cfg.rpc, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_getTransactionCount", params: [address, "pending"] }), cache: "no-store" });
      if (!response.ok) return null;
      const json = (await response.json()) as { result?: unknown; error?: unknown };
      return typeof json.result === "string" ? json.result : null;
    } catch { return null; }
  };
  return {
    ...provider,
    request: async (args: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (args.method === "wallet_switchEthereumChain") {
        const first = Array.isArray(args.params) ? args.params[0] : undefined;
        const chainId = first && typeof first === "object" && "chainId" in first ? String((first as { chainId: string }).chainId).toLowerCase() : "";
        const cfg = chainRpc[chainId];
        if (cfg) {
          try { await originalRequest({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: cfg.name, rpcUrls: [cfg.rpc], nativeCurrency: cfg.currency, blockExplorerUrls: [cfg.explorer] }] }); }
          catch (e) { const msg = e instanceof Error ? e.message : String(e); try { sessionStorage.setItem(`agfusion_rpc_guard_${chainId}`, msg.slice(0, 240)); } catch { /* ignore */ } }
        }
      }
      if (args.method === "eth_sendTransaction" && Array.isArray(args.params)) {
        const rawTx = args.params[0];
        if (rawTx && typeof rawTx === "object") {
          const tx = { ...(rawTx as Record<string, unknown>) };
          const from = typeof tx.from === "string" && tx.from ? tx.from : meta.address || "";
          const hasNonce = tx.nonce !== undefined && tx.nonce !== null && tx.nonce !== "";
          if (from && !hasNonce) {
            const cfg = await currentChainConfig();
            if (cfg) {
              const nonce = await proxyNonce(cfg, from);
              if (nonce) {
                tx.nonce = nonce;
                if (!tx.from) tx.from = from;
                try { sessionStorage.setItem("agfusion_last_wallet_rpc_guard", JSON.stringify({ chain: cfg.name, chainKey: cfg.key, method: "eth_getTransactionCount", source: "agfusion-proxy", at: Date.now() })); } catch { /* ignore */ }
              }
            }
          }
          return originalRequest({ ...args, params: [tx, ...args.params.slice(1)] });
        }
      }
      return originalRequest(args);
    },
  } as InjectedProvider;
}

export function setActiveWallet(wallet: DiscoveredWallet, address?: string, smartAccountAddress?: string): void {
  clearCircleSelectionMarker();
  const meta: ActiveWalletMeta = { uuid: wallet.uuid, name: wallet.name, rdns: wallet.rdns, address: address?.toLowerCase(), smartAccountAddress: smartAccountAddress?.toLowerCase(), walletType: wallet.name };
  activeProvider = wrapWalletRpcGuard(wallet.provider, meta);
  activeMeta = meta;
  saveMeta(activeMeta);
}

export function setActiveProvider(provider: InjectedProvider, meta: ActiveWalletMeta): void { activeProvider = wrapWalletRpcGuard(provider, meta); activeMeta = meta; saveMeta(meta); }
export function clearActiveWallet(): void { activeProvider = null; activeMeta = null; saveMeta(null); }
export function getActiveWalletMeta(): ActiveWalletMeta | null {
  if (activeMeta) return activeMeta;
  const circleMeta = loadCircleMeta();
  if (circleMeta) { activeMeta = circleMeta; return activeMeta; }
  activeMeta = loadMeta();
  return activeMeta;
}
export function getActiveProvider(): InjectedProvider | null { return activeProvider; }

async function restoreCircleActiveWallet(): Promise<{ provider: InjectedProvider; meta: ActiveWalletMeta } | null> {
  try {
    const circle = await import("@/sdk/circle-pw");
    const restored = await circle.restoreCircleSession();
    if (!restored) return null;
    const nextMeta: ActiveWalletMeta = { uuid: "circle-pw", name: "Circle Email Wallet", address: restored.address.toLowerCase(), walletType: "circle", chainId: "Arc_Testnet" };
    setActiveProvider(restored.provider as InjectedProvider, nextMeta);
    return { provider: activeProvider as InjectedProvider, meta: nextMeta };
  } catch { return null; }
}

export async function resolveActiveProvider(discover: () => Promise<DiscoveredWallet[]>): Promise<{ provider: InjectedProvider; meta: ActiveWalletMeta } | null> {
  if (activeProvider && activeMeta) return { provider: activeProvider, meta: activeMeta };
  const meta = getActiveWalletMeta();
  if (meta?.uuid === "circle-pw") {
    const restored = await restoreCircleActiveWallet();
    if (restored) return restored;
    return null;
  }
  const wallets = await discover();
  if (meta) {
    const hit = wallets.find((w) => meta.rdns && w.rdns === meta.rdns) || wallets.find((w) => w.uuid === meta.uuid) || wallets.find((w) => w.name.toLowerCase() === meta.name.toLowerCase()) || (meta.address ? await findProviderByAddress(wallets, meta.address) : null);
    if (hit) {
      const nextMeta: ActiveWalletMeta = { uuid: hit.uuid, name: hit.name, rdns: hit.rdns, address: meta.address, smartAccountAddress: meta.smartAccountAddress, walletType: meta.walletType, chainId: meta.chainId };
      activeProvider = wrapWalletRpcGuard(hit.provider, nextMeta);
      activeMeta = nextMeta;
      return { provider: activeProvider, meta: activeMeta };
    }
    return null;
  }
  const circleRestored = await restoreCircleActiveWallet();
  if (circleRestored) return circleRestored;
  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.length) {
        const m: ActiveWalletMeta = { uuid: w.uuid, name: w.name, rdns: w.rdns, address: accounts[0].toLowerCase(), walletType: w.name };
        setActiveProvider(w.provider, m);
        return { provider: activeProvider as InjectedProvider, meta: m };
      }
    } catch { /* try next */ }
  }
  return null;
}

async function findProviderByAddress(wallets: DiscoveredWallet[], address: string): Promise<DiscoveredWallet | null> {
  const target = address.toLowerCase();
  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.some((a) => a.toLowerCase() === target)) return w;
    } catch { /* continue */ }
  }
  return null;
}
