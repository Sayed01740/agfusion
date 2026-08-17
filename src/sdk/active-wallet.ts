/**
 * Session-sticky active wallet provider.
 * Prevents MetaMask from stealing signatures when the user connected Rabby (or any other wallet).
 */

import type { DiscoveredWallet, InjectedProvider } from "@/sdk/wallet-adapter";

const STORAGE_KEY = "agfusion_active_wallet_v1";

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
 * For Rabby specifically, AGFusion now avoids eth_sendTransaction entirely:
 * 1. Build nonce/gas/fee/chainId through the AGFusion server-side RPC proxy.
 * 2. Ask Rabby only to sign the fully populated transaction with
 *    eth_signTransaction.
 * 3. Broadcast the returned raw transaction through /api/rpc.
 *
 * This keeps private-key custody and user approval inside Rabby while removing
 * Rabby's own RPC provider from the transaction broadcast path. No paid RPC
 * account is required.
 */
function wrapWalletRpcGuard(
  provider: InjectedProvider,
  meta: ActiveWalletMeta,
): InjectedProvider {
  if (typeof window === "undefined") return provider;
  if (meta.uuid === "circle-pw" || !!meta.smartAccountAddress) return provider;

  const origin = window.location.origin;
  const chainRpc: Record<string, WalletRpcConfig> = {
    "0x4cef52": { name: "Arc Testnet", rpc: `${origin}/api/rpc?chain=arc`, explorer: "https://testnet.arcscan.app", currency: { name: "USDC", symbol: "USDC", decimals: 18 }, key: "arc" },
    "0x14a34": { name: "Base Sepolia", rpc: `${origin}/api/rpc?chain=base`, explorer: "https://sepolia.basescan.org", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "base" },
    "0xaa36a7": { name: "Ethereum Sepolia", rpc: `${origin}/api/rpc?chain=eth`, explorer: "https://sepolia.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "eth" },
    "0x66eee": { name: "Arbitrum Sepolia", rpc: `${origin}/api/rpc?chain=arb`, explorer: "https://sepolia.arbiscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "arb" },
    "0xaa37dc": { name: "OP Sepolia", rpc: `${origin}/api/rpc?chain=op`, explorer: "https://sepolia-optimism.etherscan.io", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "op" },
    "0x13882": { name: "Polygon Amoy", rpc: `${origin}/api/rpc?chain=polygon`, explorer: "https://amoy.polygonscan.com", currency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, key: "polygon" },
    "0xa869": { name: "Avalanche Fuji", rpc: `${origin}/api/rpc?chain=avax`, explorer: "https://testnet.snowtrace.io", currency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, key: "avax" },
    "0x515": { name: "Unichain Sepolia", rpc: `${origin}/api/rpc?chain=unichain`, explorer: "https://sepolia.uniscan.xyz", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "unichain" },
    "0xe705": { name: "Linea Sepolia", rpc: `${origin}/api/rpc?chain=linea`, explorer: "https://sepolia.lineascan.build", currency: { name: "Ether", symbol: "ETH", decimals: 18 }, key: "linea" },
  };

  const originalRequest = provider.request.bind(provider);
  const isRabby =
    meta.name.toLowerCase().includes("rabby") ||
    meta.rdns?.toLowerCase() === "io.rabby";

  async function proxyRpc(
    cfg: WalletRpcConfig,
    method: string,
    params: unknown[] = [],
  ): Promise<unknown> {
    const response = await fetch(cfg.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      cache: "no-store",
    });
    const json = (await response.json()) as {
      result?: unknown;
      error?: { message?: string; code?: number };
    };
    if (!response.ok || json.error) {
      throw new Error(
        `${method} via AGFusion RPC failed: ${json.error?.message || `HTTP ${response.status}`}`,
      );
    }
    return json.result;
  }

  const currentChainConfig = async (): Promise<WalletRpcConfig | null> => {
    try {
      const raw = await originalRequest({ method: "eth_chainId" });
      const chainId = String(raw ?? "").toLowerCase();
      return chainRpc[chainId] ?? null;
    } catch {
      return null;
    }
  };

  async function signAndBroadcastViaAgfusion(
    cfg: WalletRpcConfig,
    rawTx: Record<string, unknown>,
  ): Promise<string> {
    const from = typeof rawTx.from === "string" ? rawTx.from : "";
    if (!from) throw new Error("Transaction is missing the sender address.");

    const tx: Record<string, unknown> = { ...rawTx };

    // Resolve every network-dependent field before asking Rabby to sign.
    if (tx.nonce === undefined || tx.nonce === null || tx.nonce === "") {
      tx.nonce = await proxyRpc(cfg, "eth_getTransactionCount", [from, "pending"]);
    }

    if (tx.chainId === undefined || tx.chainId === null || tx.chainId === "") {
      tx.chainId = await proxyRpc(cfg, "eth_chainId");
    }

    if (tx.gas === undefined || tx.gas === null || tx.gas === "") {
      tx.gas = await proxyRpc(cfg, "eth_estimateGas", [tx]);
    }

    const isTyped =
      tx.type === 2 ||
      tx.type === "0x2" ||
      tx.type === "0x02" ||
      tx.maxFeePerGas !== undefined ||
      tx.maxPriorityFeePerGas !== undefined;

    if (isTyped) {
      if (tx.maxFeePerGas === undefined || tx.maxFeePerGas === null || tx.maxFeePerGas === "") {
        tx.maxFeePerGas = await proxyRpc(cfg, "eth_gasPrice");
      }
      if (
        tx.maxPriorityFeePerGas === undefined ||
        tx.maxPriorityFeePerGas === null ||
        tx.maxPriorityFeePerGas === ""
      ) {
        try {
          const priority = await proxyRpc(cfg, "eth_maxPriorityFeePerGas");
          const maxFee = BigInt(String(tx.maxFeePerGas));
          tx.maxPriorityFeePerGas =
            BigInt(String(priority)) <= maxFee ? priority : `0x${maxFee.toString(16)}`;
        } catch {
          tx.maxPriorityFeePerGas = "0x0";
        }
      }
      delete tx.gasPrice;
    } else if (tx.gasPrice === undefined || tx.gasPrice === null || tx.gasPrice === "") {
      tx.gasPrice = await proxyRpc(cfg, "eth_gasPrice");
    }

    // Rabby is responsible only for signing. The browser wallet must not be
    // asked to broadcast, because its own confirmation/RPC layer can use the
    // unavailable dRPC free-plan endpoint.
    const signed = await originalRequest({
      method: "eth_signTransaction",
      params: [tx],
    });

    if (typeof signed !== "string" || !signed.startsWith("0x")) {
      throw new Error("Rabby did not return a signed transaction.");
    }

    const hash = await proxyRpc(cfg, "eth_sendRawTransaction", [signed]);
    if (typeof hash !== "string" || !hash.startsWith("0x")) {
      throw new Error("AGFusion RPC did not return a transaction hash.");
    }

    try {
      sessionStorage.setItem(
        "agfusion_last_wallet_rpc_guard",
        JSON.stringify({
          chain: cfg.name,
          chainKey: cfg.key,
          method: "eth_sendRawTransaction",
          signer: "Rabby/eth_signTransaction",
          at: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }

    return hash;
  }

  return {
    ...provider,
    request: async (args: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (args.method === "wallet_switchEthereumChain") {
        const first = Array.isArray(args.params) ? args.params[0] : undefined;
        const chainId =
          first && typeof first === "object" && "chainId" in first
            ? String((first as { chainId: string }).chainId).toLowerCase()
            : "";
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
            try {
              sessionStorage.setItem(`agfusion_rpc_guard_${chainId}`, msg.slice(0, 240));
            } catch {
              /* ignore */
            }
          }
        }
      }

      if (args.method === "eth_sendTransaction" && Array.isArray(args.params)) {
        const rawTx = args.params[0];
        if (rawTx && typeof rawTx === "object") {
          const tx = { ...(rawTx as Record<string, unknown>) };
          const from = typeof tx.from === "string" ? tx.from : "";
          const cfg = await currentChainConfig();

          if (isRabby && from && cfg) {
            return signAndBroadcastViaAgfusion(cfg, tx);
          }

          // Non-Rabby wallets keep the original EIP-1193 flow, but still get a
          // proxy-sourced nonce where possible to avoid unnecessary wallet RPC.
          const hasNonce = tx.nonce !== undefined && tx.nonce !== null && tx.nonce !== "";
          if (from && !hasNonce && cfg) {
            try {
              tx.nonce = await proxyRpc(cfg, "eth_getTransactionCount", [from, "pending"]);
            } catch {
              /* Let the wallet resolve nonce if its own provider supports it. */
            }
            return originalRequest({ ...args, params: [tx, ...args.params.slice(1)] });
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