/**
 * Multi-wallet discovery + Arc Testnet connect.
 * Always reuses the user-selected wallet (Rabby, MetaMask, …) — never hijacks to MetaMask.
 */

import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_MANUAL,
  ARC_TESTNET_RPC,
  getArcWalletAddParams,
} from "@/lib/arc-chain";
import {
  clearActiveWallet,
  getActiveWalletMeta,
  resolveActiveProvider,
  setActiveWallet,
} from "@/sdk/active-wallet";

export type InjectedProvider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isOkxWallet?: boolean;
  isTrust?: boolean;
  isPhantom?: boolean;
  providers?: InjectedProvider[];
};

export type DiscoveredWallet = {
  uuid: string;
  name: string;
  icon?: string;
  rdns?: string;
  provider: InjectedProvider;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
    coinbaseWalletExtension?: InjectedProvider;
    okxwallet?: InjectedProvider;
    trustwallet?: InjectedProvider;
    phantom?: { ethereum?: InjectedProvider };
  }
}

type EIP6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: InjectedProvider;
};

function guessName(p: InjectedProvider): string {
  if (p.isRabby) return "Rabby";
  if (p.isCoinbaseWallet) return "Coinbase Wallet";
  if (p.isBraveWallet) return "Brave Wallet";
  if (p.isOkxWallet) return "OKX Wallet";
  if (p.isTrust) return "Trust Wallet";
  if (p.isPhantom) return "Phantom";
  // MetaMask sets isMetaMask=true even when window.ethereum is a multi-provider proxy
  if (p.isMetaMask && !p.isRabby) return "MetaMask";
  return "Browser Wallet";
}

export async function discoverWallets(): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") return [];

  const byKey = new Map<string, DiscoveredWallet>();
  const add = (w: DiscoveredWallet) => {
    const key = w.rdns || w.uuid || w.name;
    if (!byKey.has(key)) byKey.set(key, w);
  };

  await new Promise<void>((resolve) => {
    const onAnnounce = ((event: CustomEvent<EIP6963Detail>) => {
      const { info, provider } = event.detail;
      add({
        uuid: info.uuid,
        name: info.name,
        icon: info.icon,
        rdns: info.rdns,
        provider,
      });
    }) as EventListener;

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve();
    }, 400);
  });

  const eth = window.ethereum;
  // Prefer EIP-6963 list; only fall back to ethereum.providers when empty
  if (byKey.size === 0) {
    if (eth?.providers && Array.isArray(eth.providers)) {
      eth.providers.forEach((p, i) => {
        const name = guessName(p);
        add({
          uuid: `legacy-providers-${i}-${name}`,
          name,
          provider: p,
        });
      });
    } else if (eth) {
      add({
        uuid: "legacy-ethereum",
        name: guessName(eth),
        provider: eth,
      });
    }
  }

  if (window.coinbaseWalletExtension) {
    add({
      uuid: "coinbase-ext",
      name: "Coinbase Wallet",
      provider: window.coinbaseWalletExtension,
    });
  }
  if (window.okxwallet) {
    add({
      uuid: "okx",
      name: "OKX Wallet",
      provider: window.okxwallet,
    });
  }
  if (window.trustwallet) {
    add({
      uuid: "trust",
      name: "Trust Wallet",
      provider: window.trustwallet,
    });
  }
  if (window.phantom?.ethereum) {
    add({
      uuid: "phantom-evm",
      name: "Phantom",
      provider: window.phantom.ethereum,
    });
  }

  const list = [...byKey.values()];
  // Alphabetical — do NOT rank MetaMask first
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/**
 * Get the injected provider for signing.
 * Uses the wallet the user selected (session sticky). Never defaults to MetaMask.
 */
export async function getInjectedProvider(
  preferredRdns?: string,
): Promise<InjectedProvider> {
  const wallets = await discoverWallets();

  if (preferredRdns) {
    const hit = wallets.find((w) => w.rdns === preferredRdns);
    if (hit) return hit.provider;
  }

  const resolved = await resolveActiveProvider(discoverWallets);
  if (resolved) return resolved.provider;

  if (wallets.length === 1) return wallets[0].provider;

  if (wallets.length > 1) {
    const names = wallets.map((w) => w.name).join(", ");
    throw new Error(
      `Multiple wallets found (${names}). Connect one from the AGFusion Connect button first so we use the correct wallet.`,
    );
  }

  throw new Error(
    "No browser wallet found (MetaMask, Rabby). Circle Email Wallets cannot be used for this action.",
  );
}

export async function requestAccounts(
  provider: InjectedProvider,
): Promise<string[]> {
  try {
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (accounts?.length) return accounts;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code: number }).code
        : 0;
    if (code === 4001) throw new Error("Connection rejected in wallet");
  }

  try {
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (accounts?.length) return accounts;
  } catch {
    /* ignore */
  }

  throw new Error("No account returned. Unlock your wallet and try again.");
}

const MANUAL_FIX = `Delete the old network in your wallet, then re-add:

1. Wallet → Settings → Networks → find "Arc Testnet" → Delete
2. Add network manually:
   • Network name: ${ARC_NETWORK_MANUAL.networkName}
   • RPC URL: ${ARC_NETWORK_MANUAL.rpcUrl}
   • Chain ID: ${ARC_NETWORK_MANUAL.chainId}  (hex ${ARC_NETWORK_MANUAL.chainIdHex})
   • Currency: ${ARC_NETWORK_MANUAL.currencySymbol}
   • Explorer: ${ARC_NETWORK_MANUAL.explorerUrl}
3. Click Connect again in AGFusion`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getChainId(provider: InjectedProvider): Promise<number> {
  const raw = await provider.request({ method: "eth_chainId" });
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "bigint") return Number(raw);
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.startsWith("0x")) return parseInt(s, 16);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  throw new Error(`Unexpected eth_chainId from wallet: ${String(raw)}`);
}

/**
 * Switch the *given* provider to Arc Testnet and verify eth_chainId === 5042002.
 * Rabby can show Arc in the UI while another injected provider (MetaMask) is used
 * for signing — always pass the sticky active wallet provider.
 */
export async function switchToArcTestnet(
  provider: InjectedProvider,
): Promise<number> {
  // Already on Arc?
  try {
    const current = await getChainId(provider);
    if (current === ARC_CHAIN_ID) return current;
  } catch {
    /* continue switch */
  }

  const params = await getArcWalletAddParams();
  // Normalize hex (lowercase, no unnecessary padding issues)
  const chainIdHex = (
    params.chainId.startsWith("0x")
      ? params.chainId
      : `0x${Number(params.chainId).toString(16)}`
  ).toLowerCase();

  const trySwitch = async () => {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  };

  const tryAdd = async () => {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: params.chainName,
          nativeCurrency: params.nativeCurrency,
          rpcUrls: params.rpcUrls,
          blockExplorerUrls: params.blockExplorerUrls,
        },
      ],
    });
  };

  try {
    await trySwitch();
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? Number((err as { code: number }).code)
        : 0;
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : String(err);

    if (code === 4001 || /user rejected|denied/i.test(msg)) {
      throw new Error("Network switch rejected in wallet");
    }

    // 4902 = unrecognized chain — add then switch
    try {
      await tryAdd();
    } catch (addErr: unknown) {
      const addMsg =
        addErr && typeof addErr === "object" && "message" in addErr
          ? String((addErr as { message: string }).message)
          : String(addErr);

      if (/4001|reject|denied|user rejected/i.test(addMsg)) {
        throw new Error("Add network rejected in wallet");
      }

      // "already added" / chain exists — try switch again
      if (
        !/already|exist|pending/i.test(addMsg) &&
        /rpc does not match|chain id does not match/i.test(addMsg + " " + msg)
      ) {
        throw new Error(
          `Your wallet has a bad Arc Testnet entry (wrong RPC or chain ID).\n\n${MANUAL_FIX}`,
        );
      }
    }

    try {
      await trySwitch();
    } catch {
      /* may already be on chain after add */
    }
  }

  // Wait for wallet to settle (Rabby/MetaMask sometimes lag eth_chainId)
  for (let i = 0; i < 8; i++) {
    await sleep(150 + i * 50);
    try {
      const id = await getChainId(provider);
      if (id === ARC_CHAIN_ID) return id;
    } catch {
      /* retry */
    }
  }

  let finalId = -1;
  try {
    finalId = await getChainId(provider);
  } catch {
    /* ignore */
  }

  if (finalId === ARC_CHAIN_ID) return finalId;

  throw new Error(
    `Could not switch to Arc Testnet. Wallet reports chainId=${finalId} (hex 0x${finalId > 0 ? finalId.toString(16) : "?"}), need ${ARC_CHAIN_ID} (0x4cef52).\n\n` +
      `In Rabby: select the **same account** AGFusion connected, open network list, pick **Arc Testnet**.\n\n` +
      `If Arc is wrong/corrupt:\n${MANUAL_FIX}`,
  );
}

/**
 * Force Arc + return verified chain id (throws if not on Arc).
 */
export async function ensureArcChainId(
  provider: InjectedProvider,
): Promise<number> {
  const id = await switchToArcTestnet(provider);
  if (id !== ARC_CHAIN_ID) {
    throw new Error(
      `Wallet still on chain ${id}, need Arc Testnet ${ARC_CHAIN_ID}.`,
    );
  }
  return id;
}

/** Well-known EVM testnet params for bridge source chains */
const EVM_CHAIN_PARAMS: Record<
  string,
  {
    chainId: number;
    chainIdHex: string;
    chainName: string;
    rpcUrls: string[];
    explorers: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
  }
> = {
  Arc_Testnet: {
    chainId: ARC_CHAIN_ID,
    chainIdHex: "0x4cef52",
    chainName: "Arc Testnet",
    rpcUrls: [ARC_TESTNET_RPC],
    explorers: [ARC_EXPLORER],
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 18,
    },
  },
  Base_Sepolia: {
    chainId: 84532,
    chainIdHex: "0x14a34",
    chainName: "Base Sepolia",
    rpcUrls: ["https://sepolia.base.org"],
    explorers: ["https://sepolia.basescan.org"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  Ethereum_Sepolia: {
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    chainName: "Ethereum Sepolia",
    rpcUrls: ["https://rpc.sepolia.org"],
    explorers: ["https://sepolia.etherscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  Arbitrum_Sepolia: {
    chainId: 421614,
    chainIdHex: "0x66eee",
    chainName: "Arbitrum Sepolia",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    explorers: ["https://sepolia.arbiscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  Optimism_Sepolia: {
    chainId: 11155420,
    chainIdHex: "0xaa37dc",
    chainName: "OP Sepolia",
    rpcUrls: ["https://sepolia.optimism.io"],
    explorers: ["https://sepolia-optimism.etherscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  Polygon_Amoy: {
    chainId: 80002,
    chainIdHex: "0x13882",
    chainName: "Polygon Amoy",
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    explorers: ["https://amoy.polygonscan.com"],
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  },
  Avalanche_Fuji: {
    chainId: 43113,
    chainIdHex: "0xa869",
    chainName: "Avalanche Fuji",
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
    explorers: ["https://testnet.snowtrace.io"],
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  },
};

/**
 * Switch wallet to any supported EVM testnet (needed for Base→Arc bridges).
 */
export async function switchToChainId(
  provider: InjectedProvider,
  appKitChain: string,
): Promise<number> {
  if (appKitChain === "Arc_Testnet") {
    return switchToArcTestnet(provider);
  }

  const params = EVM_CHAIN_PARAMS[appKitChain];
  if (!params) {
    throw new Error(
      `Cannot switch wallet to ${appKitChain}. Add that network in Rabby manually, then retry.`,
    );
  }

  try {
    const current = await getChainId(provider);
    if (current === params.chainId) return current;
  } catch {
    /* continue */
  }

  const chainIdHex = params.chainIdHex.toLowerCase();
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? Number((err as { code: number }).code)
        : 0;
    if (code === 4001) throw new Error("Network switch rejected in wallet");
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: params.chainName,
            nativeCurrency: params.nativeCurrency,
            rpcUrls: params.rpcUrls,
            blockExplorerUrls: params.explorers,
          },
        ],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (addErr) {
      const msg =
        addErr instanceof Error ? addErr.message : String(addErr);
      throw new Error(
        `Could not switch to ${params.chainName} (chain ${params.chainId}). ${msg}`,
      );
    }
  }

  for (let i = 0; i < 8; i++) {
    await sleep(120 + i * 40);
    try {
      const id = await getChainId(provider);
      if (id === params.chainId) return id;
    } catch {
      /* retry */
    }
  }

  const finalId = await getChainId(provider).catch(() => -1);
  if (finalId !== params.chainId) {
    throw new Error(
      `Wallet is on chain ${finalId}, need ${params.chainName} (${params.chainId}). Switch network in Rabby and retry.`,
    );
  }
  return finalId;
}

export async function connectWallet(
  wallet: DiscoveredWallet,
): Promise<{ address: string; chainId: number; provider: InjectedProvider }> {
  const { provider } = wallet;
  const accounts = await requestAccounts(provider);
  const address = accounts[0];
  if (!address) throw new Error("No account returned");

  // Sticky selection BEFORE any later getInjectedProvider() calls
  setActiveWallet(wallet, address);

  await switchToArcTestnet(provider);

  let chainId = ARC_CHAIN_ID;
  try {
    chainId = await getChainId(provider);
  } catch {
    /* default Arc */
  }

  return { address, chainId, provider };
}

export function disconnectActiveWallet(): void {
  clearActiveWallet();
}

export function getStoredWalletName(): string | null {
  return getActiveWalletMeta()?.name || null;
}

/**
 * App Kit adapter from the *active* wallet only — never wallets[0]/MetaMask.
 * Always switches to Arc Testnet first so approve/sign chainId matches the wallet.
 */
export async function createAppKitAdapterFromBrowser(opts?: {
  /** Force switch to Arc before building adapter (required for Arc swaps) */
  requireArc?: boolean;
}): Promise<{
  adapter: unknown;
  address: string;
  provider: InjectedProvider;
  chainId: number;
  walletName: string | null;
} | null> {
  try {
    if (typeof window === "undefined") return null;

    const provider = await getInjectedProvider();
    const meta = getActiveWalletMeta();
    const accounts = await requestAccounts(provider);
    const address = accounts[0];
    if (!address) return null;

    let chainId = ARC_CHAIN_ID;
    if (opts?.requireArc !== false) {
      // Hard require — do not swallow switch failures
      chainId = await ensureArcChainId(provider);
    } else {
      try {
        chainId = await getChainId(provider);
      } catch {
        chainId = ARC_CHAIN_ID;
      }
    }

    const mod = await import("@circle-fin/adapter-viem-v2");
    const create =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mod as any).createViemAdapterFromProvider ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mod as any).createAdapterFromProvider;
    if (!create) {
      console.warn("[AGFusion] createViemAdapterFromProvider missing");
      return null;
    }

    // Public reads ONLY via same-origin /api/rpc (server multi-upstream).
    // Circle wraps any RPC failure as "Network connection failed for Arc Testnet".
    // Also install fetch interceptor so direct rpc.testnet.arc.network hits proxy.
    try {
      const { installCircleApiProxy } = await import("@/lib/circle-proxy");
      installCircleApiProxy();
    } catch {
      /* ignore */
    }

    const { createPublicClient, http, fallback } = await import("viem");
    const { arcTestnet } = await import("@/lib/arc-chain");
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    const proxyUrlForChainId = (id: number): string | null => {
      if (!origin) return null;
      const map: Record<number, string> = {
        [ARC_CHAIN_ID]: `${origin}/api/rpc?chain=arc`,
        84532: `${origin}/api/rpc?chain=base`,
        11155111: `${origin}/api/rpc?chain=eth`,
        421614: `${origin}/api/rpc?chain=arb`,
        11155420: `${origin}/api/rpc?chain=op`,
        80002: `${origin}/api/rpc?chain=polygon`,
        43113: `${origin}/api/rpc?chain=avax`,
      };
      return map[id] ?? null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await create({
      provider,
      capabilities: { addressContext: "user-controlled" },
      getPublicClient: (args: {
        chain: {
          id?: number | bigint;
          name?: string;
          rpcUrls?: { default?: { http?: readonly string[] } };
        };
      }) => {
        const chainIn = args?.chain;
        // Circle may pass id as number | bigint; Arc is always 5042002
        const id = Number(
          chainIn?.id ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (chainIn as any)?.chainId ??
            ARC_CHAIN_ID,
        );
        const proxy = proxyUrlForChainId(id);
        const direct =
          chainIn?.rpcUrls?.default?.http?.[0] ||
          (id === ARC_CHAIN_ID ? ARC_TESTNET_RPC : undefined);

        // Prefer proxy only in browser; fall back to direct if no origin
        const urls = (proxy ? [proxy] : []).concat(
          direct && direct !== proxy ? [direct] : [],
        );
        if (!urls.length) urls.push(ARC_TESTNET_RPC);

        // Rewrite chain rpcUrls so any viem default path also hits proxy first
        const rewrittenChain = {
          ...(id === ARC_CHAIN_ID
            ? { ...arcTestnet, ...chainIn, id: ARC_CHAIN_ID }
            : chainIn),
          id,
          rpcUrls: {
            default: { http: urls as readonly string[] },
            public: { http: urls as readonly string[] },
          },
        };

        const transports = urls.map((u) =>
          // retryCount 0 — Circle middleware already retries; avoid storming rate limits
          http(u, { timeout: 45_000, retryCount: 0 }),
        );

        return createPublicClient({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chain: rewrittenChain as any,
          transport:
            transports.length > 1 ? fallback(transports) : transports[0],
        });
      },
    });

    // Final re-check after adapter build
    const postId = await getChainId(provider);
    if (opts?.requireArc !== false && postId !== ARC_CHAIN_ID) {
      throw new Error(
        `Wallet left Arc after connect (chainId=${postId}). Keep Rabby on Arc Testnet and retry.`,
      );
    }

    return {
      adapter,
      address,
      provider,
      chainId: postId,
      walletName: meta?.name || getStoredWalletName(),
    };
  } catch (e) {
    console.warn("[AGFusion] App Kit adapter unavailable:", e);
    if (
      e instanceof Error &&
      (/chain|Arc Testnet|5042002|0x4cef52|network switch|bad Arc/i.test(
        e.message,
      ))
    ) {
      throw e;
    }
    return null;
  }
}

export { ARC_CHAIN_ID, ARC_TESTNET_RPC, ARC_EXPLORER };

/**
 * Integrates ZeroDev Account Abstraction for AI Agent.
 * Wraps the base EOA provider in a Kernel Smart Account so the agent can execute transactions
 * automatically using Session Keys without prompting the user.
 */
export async function setupAgentSmartWallet(baseProvider: InjectedProvider, eoaAddress: string) {
  try {
    const { createSmartAccountClient, createEIP1193ProviderProxy } = await import("./zerodev-adapter");
    
    // Create Kernel Client
    const smartClient = await createSmartAccountClient(baseProvider, eoaAddress as `0x${string}`);
    
    // Wrap it in EIP-1193 Proxy
    const proxyProvider = createEIP1193ProviderProxy(smartClient, baseProvider);
    
    // Update active wallet meta with smart account address
    const currentMeta = getActiveWalletMeta();
    if (currentMeta) {
      setActiveWallet(
        { uuid: currentMeta.uuid, name: currentMeta.name, provider: proxyProvider },
        eoaAddress,
        (smartClient as any)?.account?.address
      );
    }
    
    return proxyProvider;
  } catch (e) {
    console.error("[AGFusion] Failed to setup Agent Smart Wallet:", e);
    throw e;
  }
}
