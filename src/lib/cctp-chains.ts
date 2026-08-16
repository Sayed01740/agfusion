/**
 * Shared CCTP v2 testnet chain configuration for AGFusion.
 *
 * Source of truth: the installed `@circle-fin/app-kit@1.9.0` chain definitions
 * (`node_modules/@circle-fin/app-kit/chains.cjs`). Contract addresses, domains
 * and chain IDs below are copied verbatim from that SDK so AGFusion never
 * invents a route or address.
 *
 * NOTE: `Sonic_Testnet` is intentionally excluded from bridge routes until the
 * SDK's chain definition (chainId 14601) matches the live Sonic Blaze testnet
 * (chainId 57054). Do not re-add it without verifying compatibility.
 */

import type { ChainId } from "@/types";

export interface CctpChainConfig {
  chainId: number;
  /** App Kit chain enum name (BridgeChain) */
  appKitName: ChainId;
  /** Circle Programmable Wallet blockchain string, when supported by Circle PW */
  circleBlockchain: string | null;
  /** CCTP v2 domain id (testnet) */
  domain: number;
  /** USDC token address on this chain (CCTP v2) */
  usdc: `0x${string}`;
  /** CCTP v2 TokenMessenger (testnet, shared across chains) */
  tokenMessenger: `0x${string}`;
  /** CCTP v2 MessageTransmitter (testnet, shared across chains) */
  messageTransmitter: `0x${string}`;
  /** Number of confirmations the SDK waits for burns on this chain */
  confirmations: number;
  /** /api/rpc?chain=<key> proxy key */
  rpcProxyKey: string;
  /** Canonical explorer base (from the SDK) */
  explorerUrl: string;
}

const CCTP_V2_TOKEN_MESSENGER =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
const CCTP_V2_MSG_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

/** Every testnet chain the installed SDK supports for CCTP v2 bridging. */
export const CCTP_CHAIN_CONFIG: Record<string, CctpChainConfig> = {
  Arc_Testnet: {
    chainId: 5042002,
    appKitName: "Arc_Testnet",
    circleBlockchain: "ARC-TESTNET",
    domain: 26,
    usdc: "0x3600000000000000000000000000000000000000",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 1,
    rpcProxyKey: "arc",
    explorerUrl: "https://testnet.arcscan.app",
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
    explorerUrl: "https://sepolia-optimistic.etherscan.io",
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
    explorerUrl: "https://subnets-test.avax.network/c-chain",
  },
  Unichain_Sepolia: {
    chainId: 1301,
    appKitName: "Unichain_Sepolia",
    circleBlockchain: null,
    domain: 10,
    usdc: "0x31d0220469827808B5c07F8b8a56800bAB864Fa1",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "unichain",
    explorerUrl: "https://unichain-sepolia.blockscout.com",
  },
  Linea_Sepolia: {
    chainId: 59141,
    appKitName: "Linea_Sepolia",
    circleBlockchain: null,
    domain: 11,
    usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MSG_TRANSMITTER,
    confirmations: 65,
    rpcProxyKey: "linea",
    explorerUrl: "https://sepolia.lineascan.build",
  },
};

/** Bridge chains selectable by normal EVM wallets (all verified CCTP v2 testnet routes). */
export const EVM_BRIDGE_CHAINS: ChainId[] = [
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

/** Bridge chains selectable by Circle Email Wallets (only chains Circle PW can execute today). */
export const CIRCLE_BRIDGE_CHAINS: ChainId[] = [
  "Arc_Testnet",
  "Base_Sepolia",
];

export function getCctpConfig(appKitName: string): CctpChainConfig | null {
  return CCTP_CHAIN_CONFIG[appKitName] ?? null;
}

export function cctpConfigByChainId(chainId: number): CctpChainConfig | null {
  const hit = Object.values(CCTP_CHAIN_CONFIG).find(
    (c) => c.chainId === chainId,
  );
  return hit ?? null;
}
