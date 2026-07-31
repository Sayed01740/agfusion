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

export function setActiveWallet(
  wallet: DiscoveredWallet,
  address?: string,
): void {
  activeProvider = wallet.provider;
  activeMeta = {
    uuid: wallet.uuid,
    name: wallet.name,
    rdns: wallet.rdns,
    address: address?.toLowerCase(),
  };
  saveMeta(activeMeta);
}

export function setActiveProvider(
  provider: InjectedProvider,
  meta: ActiveWalletMeta,
): void {
  activeProvider = provider;
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

/**
 * Resolve the provider the user actually connected — never default to MetaMask first.
 */
export async function resolveActiveProvider(
  discover: () => Promise<DiscoveredWallet[]>,
): Promise<{ provider: InjectedProvider; meta: ActiveWalletMeta } | null> {
  // In-memory from this page session
  if (activeProvider && activeMeta) {
    return { provider: activeProvider, meta: activeMeta };
  }

  const meta = getActiveWalletMeta();
  const wallets = await discover();
  if (!wallets.length) return null;

  if (meta) {
    // Match by rdns (best), then uuid, then name
    const hit =
      wallets.find((w) => meta.rdns && w.rdns === meta.rdns) ||
      wallets.find((w) => w.uuid === meta.uuid) ||
      wallets.find(
        (w) => w.name.toLowerCase() === meta.name.toLowerCase(),
      ) ||
      // Match by which provider already has the connected address
      (meta.address
        ? await findProviderByAddress(wallets, meta.address)
        : null);

    if (hit) {
      activeProvider = hit.provider;
      activeMeta = {
        uuid: hit.uuid,
        name: hit.name,
        rdns: hit.rdns,
        address: meta.address,
      };
      return { provider: hit.provider, meta: activeMeta };
    }
  }

  // No sticky wallet — do NOT prefer MetaMask. Prefer a provider that already has accounts.
  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts?.length) {
        const m: ActiveWalletMeta = {
          uuid: w.uuid,
          name: w.name,
          rdns: w.rdns,
          address: accounts[0].toLowerCase(),
        };
        setActiveProvider(w.provider, m);
        return { provider: w.provider, meta: m };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

async function findProviderByAddress(
  wallets: DiscoveredWallet[],
  address: string,
): Promise<DiscoveredWallet | null> {
  const target = address.toLowerCase();
  for (const w of wallets) {
    try {
      const accounts = (await w.provider.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts?.some((a) => a.toLowerCase() === target)) return w;
    } catch {
      /* continue */
    }
  }
  return null;
}
