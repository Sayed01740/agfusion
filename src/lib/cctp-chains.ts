/**
 * Shared CCTP v2 testnet chain configuration for AGFusion.
 *
 * Contract/domain data is pinned to Circle's published testnet configuration.
 * Runtime RPC health is handled separately by rpc-proxy.ts.
 */

import type { ChainId } from "@/types";
import { ARC_EXPLORER, IS_ARC_MAINNET } from "@/lib/arc-chain";

export interface CctpChainConfig {
  chainId: number;
  appKitName: ChainId;
  circleBlockchain: string | null;
  domain: number;
  usdc: `0x${string}`;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  confirmations: number;
  rpcProxyKey: string;
  explorerUrl: string;
}

// --- Testnet CCTP v2 contracts (Circle Iris Sandbox) ---
const CCTP_V2_TOKEN_MESSENGER =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
const CCTP_V2_MSG_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

// --- Production Mainnet CCTP v2 contracts (Circle Iris Production) ---
// Source: https://developers.circle.com/stablecoins/docs/evm-smart-contracts
const CCTP_V2_TOKEN_MESSENGER_MAINNET =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5f" as const;
const CCTP_V2_MSG_TRANSMITTER_MAINNET =
  "0x81D40f21B21285853e618Cc442bB505f0D2c72AF" as const;

export const CCTP_CHAIN_CONFIG: Record<string, CctpChainConfig> = {
  Arc: {
    chainId: 5042,
    appKitName: "Arc",
    circleBlockchain: "ARC",
    domain: 26,
    usdc: "0x3600000000000000000000000000000000000000",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 1,
    rpcProxyKey: "arc_mainnet",
    explorerUrl: "https://explorer.arc.io",
  },
  Arc_Mainnet: {
    chainId: 5042,
    appKitName: "Arc_Mainnet",
    circleBlockchain: "ARC",
    domain: 26,
    usdc: "0x3600000000000000000000000000000000000000",
    // Production mainnet CCTP v2 messenger contracts
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER_MAINNET,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER_MAINNET,
    confirmations: 1,
    rpcProxyKey: "arc_mainnet",
    explorerUrl: "https://explorer.arc.io",
  },
  Arc_Testnet: {
    chainId: 5042002,
    appKitName: "Arc_Testnet",
    circleBlockchain: "ARC-TESTNET",
    domain: 26,
    usdc: "0x3600000000000000000000000000000000000000",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 1,
    rpcProxyKey: "arc_testnet",
    explorerUrl: ARC_EXPLORER,
  },
  Base_Sepolia: {
    chainId: 84532,
    appKitName: "Base_Sepolia",
    circleBlockchain: "BASE-SEPOLIA",
    domain: 6,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "base",
    explorerUrl: "https://sepolia.basescan.org",
  },
  Ethereum_Sepolia: {
    chainId: 11155111,
    appKitName: "Ethereum_Sepolia",
    circleBlockchain: null,
    domain: 0,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "eth",
    explorerUrl: "https://sepolia.etherscan.io",
  },
  Arbitrum_Sepolia: {
    chainId: 421614,
    appKitName: "Arbitrum_Sepolia",
    circleBlockchain: null,
    domain: 3,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "arb",
    explorerUrl: "https://sepolia.arbiscan.io",
  },
  Optimism_Sepolia: {
    chainId: 11155420,
    appKitName: "Optimism_Sepolia",
    circleBlockchain: null,
    domain: 2,
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "op",
    explorerUrl: "https://sepolia-optimism.etherscan.io",
  },
  Polygon_Amoy_Testnet: {
    chainId: 80002,
    appKitName: "Polygon_Amoy_Testnet",
    circleBlockchain: null,
    domain: 7,
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "polygon",
    explorerUrl: "https://amoy.polygonscan.com",
  },
  Avalanche_Fuji: {
    chainId: 43113,
    appKitName: "Avalanche_Fuji",
    circleBlockchain: null,
    domain: 1,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "avax",
    explorerUrl: "https://testnet.snowtrace.io",
  },
  Unichain_Sepolia: {
    chainId: 1301,
    appKitName: "Unichain_Sepolia",
    circleBlockchain: null,
    domain: 10,
    usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "unichain",
    explorerUrl: "https://sepolia.uniscan.xyz",
  },
  Linea_Sepolia: {
    chainId: 59141,
    appKitName: "Linea_Sepolia",
    circleBlockchain: null,
    domain: 11,
    // Circle's current USDC contract registry lists this as the native USDC
    // deployment for Linea Sepolia. Do not substitute OP/Unichain USDC here.
    usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "linea",
    explorerUrl: "https://sepolia.lineascan.build",
  },
  // --- Mainnet CCTP chains (Circle Iris Production) ---
  Base: {
    chainId: 8453,
    appKitName: "Base",
    circleBlockchain: "BASE",
    domain: 6,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER_MAINNET,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER_MAINNET,
    confirmations: 5,
    rpcProxyKey: "base",
    explorerUrl: "https://basescan.org",
  },
  Ethereum: {
    chainId: 1,
    appKitName: "Ethereum",
    circleBlockchain: "ETH",
    domain: 0,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER_MAINNET,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER_MAINNET,
    confirmations: 65,
    rpcProxyKey: "eth",
    explorerUrl: "https://etherscan.io",
  },
  Arbitrum: {
    chainId: 42161,
    appKitName: "Arbitrum",
    circleBlockchain: "ARB",
    domain: 3,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER_MAINNET,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER_MAINNET,
    confirmations: 65,
    rpcProxyKey: "arb",
    explorerUrl: "https://arbiscan.io",
  },
  Optimism: {
    chainId: 10,
    appKitName: "Optimism",
    circleBlockchain: "OP",
    domain: 2,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER_MAINNET,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER_MAINNET,
    confirmations: 65,
    rpcProxyKey: "op",
    explorerUrl: "https://optimistic.etherscan.io",
  },
};

export const EVM_BRIDGE_CHAINS: ChainId[] = [
  "Arc",
  "Arc_Mainnet",
  "Arc_Testnet",
  "Ethereum_Sepolia",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Optimism_Sepolia",
  "Polygon_Amoy_Testnet",
  "Avalanche_Fuji",
  "Unichain_Sepolia",
  "Linea_Sepolia",
];

/** IS_ARC_MAINNET-aware bridge chain list for the UI */
export const CIRCLE_BRIDGE_CHAINS: ChainId[] = IS_ARC_MAINNET
  ? ["Arc_Mainnet", "Base", "Ethereum", "Arbitrum", "Optimism"]
  : ["Arc_Testnet", "Base_Sepolia", "Ethereum_Sepolia", "Arbitrum_Sepolia", "Optimism_Sepolia"];

export function getCctpConfig(appKitName: string): CctpChainConfig | null {
  return CCTP_CHAIN_CONFIG[appKitName] ?? null;
}

export function cctpConfigByChainId(chainId: number): CctpChainConfig | null {
  // Deterministic lookup — avoids Object.values() ordering ambiguity for
  // chains that share a chain ID (Arc / Arc_Mainnet both = 5042).
  if (chainId === 5042) return CCTP_CHAIN_CONFIG["Arc_Mainnet"];
  if (chainId === 5042002) return CCTP_CHAIN_CONFIG["Arc_Testnet"];
  return Object.values(CCTP_CHAIN_CONFIG).find((c) => c.chainId === chainId) ?? null;
}
