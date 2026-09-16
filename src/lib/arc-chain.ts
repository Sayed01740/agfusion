import { defineChain, type Chain } from "viem";

/**
 * Arc Network Configuration (Mainnet or Testnet).
 *
 * Configurable via environment variables:
 * - NEXT_PUBLIC_ARC_NETWORK ("mainnet" | "testnet")
 * - NEXT_PUBLIC_ARC_CHAIN_ID ("5042" | "5042002")
 * - NEXT_PUBLIC_ARC_RPC_URL
 * - NEXT_PUBLIC_ARC_EXPLORER_URL
 */

export const IS_ARC_MAINNET =
  process.env.NEXT_PUBLIC_ARC_NETWORK === "mainnet" ||
  process.env.NEXT_PUBLIC_ARC_CHAIN_ID === "5042" ||
  process.env.NEXT_PUBLIC_ARC_CHAIN_HEX?.toLowerCase() === "0x13b2";

export const ARC_CHAIN_ID = IS_ARC_MAINNET ? 5042 : 5042002;
export const ARC_CHAIN_ID_HEX = IS_ARC_MAINNET ? "0x13b2" : "0x4cef52";
export const ARC_NETWORK_NAME = IS_ARC_MAINNET ? "Arc Mainnet" : "Arc Testnet";

export const ARC_RPC =
  process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
  (IS_ARC_MAINNET ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io");

export const ARC_WS =
  process.env.NEXT_PUBLIC_ARC_WS_URL?.trim() ||
  (IS_ARC_MAINNET ? "wss://rpc.mainnet.arc.io" : "wss://rpc.testnet.arc.io");

// Backward compatibility alias for testnet RPC exports
export const ARC_TESTNET_RPC = ARC_RPC;
export const ARC_TESTNET_WS = ARC_WS;

export const ARC_CURRENCY_SYMBOL = "USDC";
export const ARC_CURRENCY_NAME = "USDC";
export const ARC_CURRENCY_DECIMALS = 18;

export const ARC_EXPLORER =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() ||
  (IS_ARC_MAINNET ? "https://explorer.arc.io" : "https://testnet.arcscan.app");

export const ARC_FAUCET_URL = "https://faucet.circle.com";
export const ARC_DOCS_URL = "https://docs.arc.io";
export const ARC_APPKIT_URL = "https://docs.arc.io/app-kit";

/** MetaMask / EIP-3085 wallet_addEthereumChain params */
export const ARC_WALLET_PARAMS = {
  chainId: ARC_CHAIN_ID_HEX,
  chainName: ARC_NETWORK_NAME,
  nativeCurrency: {
    name: ARC_CURRENCY_NAME,
    symbol: ARC_CURRENCY_SYMBOL,
    decimals: ARC_CURRENCY_DECIMALS,
  },
  rpcUrls: [ARC_RPC],
  blockExplorerUrls: [ARC_EXPLORER],
};

export const ARC_TESTNET_WALLET_PARAMS = ARC_WALLET_PARAMS;

/** Query RPC for eth_chainId so wallet_add always matches MetaMask checks. */
export async function fetchArcChainIdFromRpc(
  rpcUrl: string = ARC_RPC,
): Promise<{ hex: string; decimal: number }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!res.ok) {
    throw new Error(`Arc RPC unreachable (${res.status}): ${rpcUrl}`);
  }
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error?.message) {
    throw new Error(`Arc RPC error: ${data.error.message}`);
  }
  const hex = (data.result || "").toLowerCase();
  if (!hex.startsWith("0x")) {
    throw new Error(`Invalid eth_chainId from RPC: ${data.result}`);
  }
  const decimal = parseInt(hex, 16);
  return { hex, decimal };
}

/** Build wallet_addEthereumChain params using live RPC chainId. */
export async function getArcWalletAddParams(): Promise<{
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}> {
  const rpc = ARC_RPC;
  let chainId = ARC_CHAIN_ID_HEX.toLowerCase();
  try {
    const live = await fetchArcChainIdFromRpc(rpc);
    chainId = live.hex;
    if (live.decimal !== ARC_CHAIN_ID) {
      console.warn(
        `[AGFusion] RPC chainId decimal ${live.decimal} != expected ${ARC_CHAIN_ID}`,
      );
    }
  } catch (e) {
    console.warn("[AGFusion] using static chainId hex; RPC probe failed", e);
  }

  return {
    chainId,
    chainName: ARC_NETWORK_NAME,
    nativeCurrency: {
      name: ARC_CURRENCY_NAME,
      symbol: ARC_CURRENCY_SYMBOL,
      decimals: ARC_CURRENCY_DECIMALS,
    },
    rpcUrls: [rpc],
    blockExplorerUrls: [ARC_EXPLORER],
  };
}

/** viem chain definitions for both Mainnet and Testnet */
export const arcMainnetChain = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: {
    name: ARC_CURRENCY_NAME,
    symbol: ARC_CURRENCY_SYMBOL,
    decimals: ARC_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.arc.io"],
      webSocket: ["wss://rpc.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://explorer.arc.io",
    },
  },
  testnet: false,
});

export const arcTestnetChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: ARC_CURRENCY_NAME,
    symbol: ARC_CURRENCY_SYMBOL,
    decimals: ARC_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan Testnet",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

/** viem chain definition based on default config */
export const arcChain = IS_ARC_MAINNET ? arcMainnetChain : arcTestnetChain;
export const arcTestnet = arcChain;

export interface ArcNetworkMeta {
  name: string;
  shortName: string;
  chainId: number;
  chainIdHex: string;
  rpc: string;
  ws: string;
  explorer: string;
  isMainnet: boolean;
  isTestnet: boolean;
  isArc: boolean;
  chain: Chain;
}

/**
 * Dynamically detects whether a given chainId (e.g. from wallet or event)
 * is Arc Mainnet (5042) or Arc Testnet (5042002).
 * If chainId is null, undefined, or unknown, it falls back to the configured default network.
 */
export function getArcNetworkMeta(chainId?: number | string | null): ArcNetworkMeta {
  const numId =
    typeof chainId === "number"
      ? chainId
      : typeof chainId === "string" && chainId.startsWith("0x")
      ? parseInt(chainId, 16)
      : typeof chainId === "string" && /^\d+$/.test(chainId)
      ? parseInt(chainId, 10)
      : null;

  if (numId === 5042) {
    return {
      name: "Arc Mainnet",
      shortName: "Arc Mainnet",
      chainId: 5042,
      chainIdHex: "0x13b2",
      rpc: process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io",
      ws: process.env.NEXT_PUBLIC_ARC_WS_URL?.trim() || "wss://rpc.mainnet.arc.io",
      explorer: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() || "https://explorer.arc.io",
      isMainnet: true,
      isTestnet: false,
      isArc: true,
      chain: arcMainnetChain,
    };
  }

  if (numId === 5042002) {
    return {
      name: "Arc Testnet",
      shortName: "Arc Testnet",
      chainId: 5042002,
      chainIdHex: "0x4cef52",
      rpc: "https://rpc.testnet.arc.io",
      ws: "wss://rpc.testnet.arc.io",
      explorer: "https://testnet.arcscan.app",
      isMainnet: false,
      isTestnet: true,
      isArc: true,
      chain: arcTestnetChain,
    };
  }

  // Not on Arc or not connected: return default config
  const isDefaultMainnet = IS_ARC_MAINNET;
  return {
    name: ARC_NETWORK_NAME,
    shortName: ARC_NETWORK_NAME,
    chainId: ARC_CHAIN_ID,
    chainIdHex: ARC_CHAIN_ID_HEX,
    rpc: ARC_RPC,
    ws: ARC_WS,
    explorer: ARC_EXPLORER,
    isMainnet: isDefaultMainnet,
    isTestnet: !isDefaultMainnet,
    isArc: numId === 5042 || numId === 5042002,
    chain: arcChain,
  };
}

export function explorerTxUrl(txHash: string, chainOrId?: string | number): string {
  // Arc Mainnet
  if (chainOrId === 5042 || chainOrId === "Arc" || chainOrId === "Arc_Mainnet") {
    return `https://explorer.arc.io/tx/${txHash}`;
  }
  // Arc Testnet
  if (chainOrId === 5042002 || chainOrId === "Arc_Testnet") {
    return `https://testnet.arcscan.app/tx/${txHash}`;
  }
  // Base Mainnet
  if (chainOrId === "Base" || chainOrId === 8453) {
    return `https://basescan.org/tx/${txHash}`;
  }
  // Base Sepolia Testnet
  if (chainOrId === "Base_Sepolia" || chainOrId === "base" || chainOrId === 84532) {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  // Ethereum Mainnet
  if (chainOrId === "Ethereum" || chainOrId === 1) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  // Ethereum Sepolia
  if (chainOrId === "Ethereum_Sepolia" || chainOrId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
  // Arbitrum One Mainnet
  if (chainOrId === "Arbitrum" || chainOrId === 42161) {
    return `https://arbiscan.io/tx/${txHash}`;
  }
  // Arbitrum Sepolia
  if (chainOrId === "Arbitrum_Sepolia" || chainOrId === 421614) {
    return `https://sepolia.arbiscan.io/tx/${txHash}`;
  }
  // Optimism Mainnet
  if (chainOrId === "Optimism" || chainOrId === 10) {
    return `https://optimistic.etherscan.io/tx/${txHash}`;
  }
  // Optimism Sepolia
  if (chainOrId === "Optimism_Sepolia" || chainOrId === 11155420) {
    return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
  }
  // Fallback: use configured Arc explorer
  return `${ARC_EXPLORER}/tx/${txHash}`;
}

export function isArcChainId(id: number | null | undefined): boolean {
  return id === 5042 || id === 5042002;
}

export const ARC_NETWORK_MANUAL = {
  networkName: ARC_NETWORK_NAME,
  rpcUrl: ARC_RPC,
  chainId: String(ARC_CHAIN_ID),
  chainIdHex: ARC_CHAIN_ID_HEX,
  currencySymbol: ARC_CURRENCY_SYMBOL,
  explorerUrl: ARC_EXPLORER,
} as const;

