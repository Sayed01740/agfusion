import type { ChainId } from "@/types";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_NAME,
  ARC_TESTNET_RPC,
  ARC_CURRENCY_DECIMALS,
  ARC_CURRENCY_NAME,
  ARC_CURRENCY_SYMBOL,
} from "@/lib/arc-chain";

export interface ChainMeta {
  id: ChainId;
  label: string;
  short: string;
  color: string;
  explorer: string;
  appKitName: string;
  testnet: boolean;
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  Arc_Testnet: {
    id: "Arc_Testnet",
    label: "Arc Testnet",
    short: "Arc",
    color: "#22d3ee",
    explorer: ARC_EXPLORER,
    appKitName: "Arc_Testnet",
    testnet: true,
  },
  Ethereum_Sepolia: {
    id: "Ethereum_Sepolia",
    label: "Ethereum Sepolia",
    short: "ETH",
    color: "#627eea",
    explorer: "https://sepolia.etherscan.io",
    appKitName: "Ethereum_Sepolia",
    testnet: true,
  },
  Base_Sepolia: {
    id: "Base_Sepolia",
    label: "Base Sepolia",
    short: "Base",
    color: "#0052ff",
    explorer: "https://sepolia.basescan.org",
    appKitName: "Base_Sepolia",
    testnet: true,
  },
  Arbitrum_Sepolia: {
    id: "Arbitrum_Sepolia",
    label: "Arbitrum Sepolia",
    short: "Arb",
    color: "#28a0f0",
    explorer: "https://sepolia.arbiscan.io",
    appKitName: "Arbitrum_Sepolia",
    testnet: true,
  },
  Optimism_Sepolia: {
    id: "Optimism_Sepolia",
    label: "Optimism Sepolia",
    short: "OP",
    color: "#ff0420",
    explorer: "https://sepolia-optimism.etherscan.io",
    appKitName: "Optimism_Sepolia",
    testnet: true,
  },
  Polygon_Amoy: {
    id: "Polygon_Amoy",
    label: "Polygon Amoy",
    short: "Pol",
    color: "#8247e5",
    explorer: "https://amoy.polygonscan.com",
    appKitName: "Polygon_Amoy",
    testnet: true,
  },
  Avalanche_Fuji: {
    id: "Avalanche_Fuji",
    label: "Avalanche Fuji",
    short: "Avax",
    color: "#e84142",
    explorer: "https://testnet.snowtrace.io",
    appKitName: "Avalanche_Fuji",
    testnet: true,
  },
  Solana_Devnet: {
    id: "Solana_Devnet",
    label: "Solana Devnet",
    short: "Sol",
    color: "#14f195",
    explorer: "https://explorer.solana.com/?cluster=devnet",
    appKitName: "Solana_Devnet",
    testnet: true,
  },
};

export const ARC_TESTNET = {
  id: ARC_CHAIN_ID,
  name: ARC_NETWORK_NAME,
  network: "arc-testnet",
  nativeCurrency: {
    name: ARC_CURRENCY_NAME,
    symbol: ARC_CURRENCY_SYMBOL,
    decimals: ARC_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC] },
    public: { http: [ARC_TESTNET_RPC] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_EXPLORER },
  },
  testnet: true,
} as const;

export const CHAIN_LIST = Object.values(CHAINS);

export function resolveChain(input?: string): ChainId | undefined {
  if (!input) return undefined;
  const q = input.toLowerCase().trim();
  const aliases: Record<string, ChainId> = {
    arc: "Arc_Testnet",
    "arc testnet": "Arc_Testnet",
    eth: "Ethereum_Sepolia",
    ethereum: "Ethereum_Sepolia",
    sepolia: "Ethereum_Sepolia",
    base: "Base_Sepolia",
    arb: "Arbitrum_Sepolia",
    arbitrum: "Arbitrum_Sepolia",
    op: "Optimism_Sepolia",
    optimism: "Optimism_Sepolia",
    polygon: "Polygon_Amoy",
    matic: "Polygon_Amoy",
    amoy: "Polygon_Amoy",
    avax: "Avalanche_Fuji",
    avalanche: "Avalanche_Fuji",
    fuji: "Avalanche_Fuji",
    sol: "Solana_Devnet",
    solana: "Solana_Devnet",
  };
  if (aliases[q]) return aliases[q];
  const hit = CHAIN_LIST.find(
    (c) =>
      c.id.toLowerCase() === q ||
      c.label.toLowerCase() === q ||
      c.short.toLowerCase() === q,
  );
  return hit?.id;
}
