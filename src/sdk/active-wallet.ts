/**
 * Session-sticky active wallet provider.
 * Prevents MetaMask from stealing signatures when the user connected Rabby (or any other wallet).
 */

import type { DiscoveredWallet, InjectedProvider } from "@/sdk/wallet-adapter";

const STORAGE_KEY = "agfusion_active_wallet_v1";

export type ActiveWalletMeta = {
  uuid: string;
  name: string;
  rdns?: string;
  address?: string;
  smartAccountAddress?: string;
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

function saveMeta(meta: ActiveWalletMeta | null) {
  if (typeof window === "undefined") return;
  try {
    if (!meta) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/**
 * Rabby and some other EVM wallets perform nonce/gas RPC calls inside their own
 * confirmation window. Those calls do NOT use AGFusion's viem public client.
 * If the wallet has a built-in/free-plan RPC such as sepolia.drpc.org, the
 * transaction can therefore fail even though /api/rpc is healthy.
 *
 * Before a dapp-requested chain switch, ask the wallet to register the same
 * chain with AGFusion's server-side RPC proxy. This is best-effort because
 * wallets are allowed to reject updates to built-in networks.
 */
function wrapWalletRpcGuard(
  provider: InjectedProvider,
  meta: ActiveWalletMeta,
): InjectedProvider {
  if (typeof window === "undefined") return provider;
  if (meta.uuid === "circle-pw" || !!meta.smartAccountAddress) return provider;

  const chainRpc: Record<string, { name: string; rpc: string; explorer: string; currency: { name: string; symbol: string; decimals: number } }> = {
    "0x4cef52": { name: "Arc Testnet", rpc: `${window.location.origin}/api/rpc?chain=arc`, explorer: "https://testnet.arcscan.app", currency: { name: "USDC", symbol: "USDC", decimals: 18 } },
    "0x14a34": { name: "Base Sepolia", rpc: `${window.location.origin}/api/rpc?chain=base`, explorer: "https://sepolia.basescan.org", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
    "0xaa36a7": { name: "Ethereum Sepolia", rpc: `${window.location.origin}/api/rpc?chain=eth`, explorer: "https://sepolia.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
    "0x66eee": { name: "Arbitrum Sepolia", rpc: `${window.location.origin}/api/rpc?chain=arb`, explorer: "https://sepolia.arbiscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
    "0xaa37dc": { name: "OP Sepolia", rpc: `${window.location.origin}/api/rpc?chain=op`, explorer: "https://sepolia-optimism.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
    "0x13882": { name: "Polygon Amoy", rpc: `${window.location.origin}/api/rpc?chain=polygon`, explorer: "https://amoy.polygonscan.com", currency: { name: "MATIC", symbol: "MATIC", decimals: 18 } },
    "0xa869": { name: "Avalanche Fuji", rpc: `${window.location.origin}/api/rpc?chain=avax`, explorer: "https://testnet.snowtrace.io", currency: { name: "Avalanche", symbol: "AVAX", decimals: 18 } },
    "0x515": { name: "Unichain Sepolia", rpc: `${window.location.origin}/api/rpc?chain=unichain`, explorer: "https://sepolia.uniscan.xyz", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
    "0xe705": { name: "Linea Sepolia", rpc: `${window.location.origin}/api/rpc?chain=linea`, explorer: "https://sepolia.lineascan.build", currency: { name: "Ether", symbol: "ETH", decimals: 18 } },
  };

  const originalRequest = provider.request.bind(provider);
  return {
    ...provider,
    request: async (args: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (args.method === "wallet_switchEthereumChain") {
        const first = Array.isArray(args.params) ? args.params[0] : undefined;
        const chainId = first && typeof first === "object" && "chainId" in first ? String((first as { chainId: string }).chainId).toLowerCase() : "";
        const cfg = chainRpc[chainId];
        if (cfg) {
          try {
            await originalRequest({
              method: "wallet_addEthereumChain",
              params: [{
                chainId,
                chainName: cfg.name,
                rpcUrls: [cfg.rpc],
                nativeCurrency: cfg.currency,
                blockExplorerUrls: [cfg.explorer],
              }],
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Built-in Rabby chains may reject re-registration. Continue to
            // switch, but leave a diagnostic marker for the UI/telemetry.
            try {
              sessionStorage.setItem(`agfusion_rpc_guard_${chainId}`, msg.slice(0, 240));
            } catch {
              /* ignore */
            }
          }
        }
      }
      return originalRequest(args);
    },
  } as InjectedProvider;
}

export function setActiveWallet(
  wallet: DiscoveredWallet,
  address?: string,
  smartAccountAddress?: string,
): void {
  const meta: ActiveWalletMeta = {
    uuid: wallet.uuid,
    name: wallet.name,
    rdns: wallet.rdns,
    address: address?.toLowerCase(),
    smartAccountAddress: smartAccountAddress?.toLowerCase(),
  };
  activeProvider = wrapWalletRpcGuard(wallet.provider, meta);
  activeMeta = meta;
  saveMeta(activeMeta);
}

export function setActiveProvider(
  provider: InjectedProvider,
  meta: ActiveWalletMeta,
): void {
  activeProvider = wrapWalletRpcGuard(provider, meta);
  activeMeta = meta;
  saveMeta(meta);
}

export function clearActiveWallet(): void {
  activeProvider = null;
  activeMeta = null;
  saveMeta(null);
}

export function getActiveWalletMeta(): ActiveWalletMeta | null {
  if (activeMeta) return activeMeta;
  activeMeta = loadMeta();
  return activeMeta;
}

export function getActiveProvider(): InjectedProvider | null {
  return activeProvider;
}

export async function resolveActiveProvider(
  discover: () => Promise<DiscoveredWallet[]>,
): Promise<{ provider: InjectedProvider; meta: ActiveWalletMeta } | null> {
  if (activeProvider && activeMeta) return { provider: activeProvider, meta: activeMeta };

  const meta = getActiveWalletMeta();
  const wallets = await discover();
  if (!wallets.length) return null;

  if (meta) {
    const hit =
      wallets.find((w) => meta.rdns && w.rdns === meta.rdns) ||
      wallets.find((w) => w.uuid === meta.uuid) ||
      wallets.find((w) => w.name.toLowerCase() === meta.name.toLowerCase()) ||
      (meta.address ? await findProviderByAddress(wallets, meta.address) : null);

    if (hit) {
      const nextMeta: ActiveWalletMeta = {
        uuid: hit.uuid,
        name: hit.name,
        rdns: hit.rdns,
        address: meta.address,
        smartAccountAddress: meta.smartAccountAddress,
      };
      activeProvider = wrapWalletRpcGuard(hit.provider, nextMeta);
      activeMeta = nextMeta;
      return { provider: activeProvider, meta: activeMeta };
    }
  }

  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.length) {
        const m: ActiveWalletMeta = {
          uuid: w.uuid,
          name: w.name,
          rdns: w.rdns,
          address: accounts[0].toLowerCase(),
        };
        setActiveProvider(w.provider, m);
        return { provider: activeProvider as InjectedProvider, meta: m };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

async function findProviderByAddress(wallets: DiscoveredWallet[], address: string): Promise<DiscoveredWallet | null> {
  const target = address.toLowerCase();
  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.some((a) => a.toLowerCase() === target)) return w;
    } catch {
      /* continue */
    }
  }
  return null;
}
