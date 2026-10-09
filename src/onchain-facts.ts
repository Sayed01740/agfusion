import type { Address } from "viem";

export interface ChainFact {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  usdc: {
    address: Address;
    decimals: number;
  };
}

const CHAINS_REGISTRY: Record<number, ChainFact> = {
  // Arc Testnet
  5042002: {
    chainId: 5042002,
    name: "Arc Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || "https://rpc.testnet.arc.network",
    explorerUrl: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() || "https://testnet.arcscan.app",
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 18, // Native gas view: 18 decimals
    },
    usdc: {
      address: "0x3600000000000000000000000000000000000000" as Address,
      decimals: 6, // Canonical ERC-20 view: 6 decimals
    },
  },
  // Arc Mainnet
  5042: {
    chainId: 5042,
    name: "Arc Mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL?.trim() || "https://rpc.mainnet.arc.network",
    explorerUrl: "https://explorer.arc.io",
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 18,
    },
    usdc: {
      address: "0x3600000000000000000000000000000000000000" as Address,
      decimals: 6,
    },
  },
  // Base Sepolia
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: {
      name: "ETH",
      symbol: "ETH",
      decimals: 18,
    },
    usdc: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
      decimals: 6,
    },
  },
};

export function requireChain(chainId: number | bigint): ChainFact {
  const id = Number(chainId);
  const fact = CHAINS_REGISTRY[id];
  if (!fact) {
    throw new Error(`Unsupported chain ID: ${chainId}. Expected Arc Testnet (5042002).`);
  }
  return fact;
}

export function getUsdc(chainId: number | bigint): { address: Address; decimals: number } {
  return requireChain(chainId).usdc;
}

export function buildTxExplorerUrl(chainId: number | bigint, txHash: string): string {
  try {
    const chain = requireChain(chainId);
    const base = chain.explorerUrl.replace(/\/$/, "");
    return `${base}/tx/${txHash}`;
  } catch {
    return `https://testnet.arcscan.app/tx/${txHash}`;
  }
}
