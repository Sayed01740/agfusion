/**
 * Arc Token Registry for the AGFusion dApp (Mainnet & Testnet).
 *
 * USDC is the native gas asset on Arc and is exposed as a 6-decimal ERC-20 at 0x3600…0000.
 */
import type { Address } from "viem";
import { IS_ARC_MAINNET } from "@/lib/arc-chain";

export type ArcToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  /** Brand accent used for the token chip gradient. */
  accent: string;
  /** True for the Arc native/gas asset (USDC). */
  native?: boolean;
};

/** Canonical Arc USDC ERC-20 interface (6 decimals) on both Mainnet and Testnet. */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as Address;

/** Arc Testnet tokens */
export const ARC_TESTNET_TOKENS: Record<string, ArcToken> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: ARC_USDC_ADDRESS,
    decimals: 6,
    accent: "#2775CA",
    native: true,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address,
    decimals: 6,
    accent: "#1A4FDA",
  },
  cirBTC: {
    symbol: "cirBTC",
    name: "Circle BTC",
    address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as Address,
    decimals: 8,
    accent: "#F7931A",
  },
};

/** Arc Mainnet tokens — only list tokens with verified Arc Mainnet contract addresses */
export const ARC_MAINNET_TOKENS: Record<string, ArcToken> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: ARC_USDC_ADDRESS,
    decimals: 6,
    accent: "#2775CA",
    native: true,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address,
    decimals: 6,
    accent: "#1A4FDA",
  },
  cirBTC: {
    symbol: "cirBTC",
    name: "Circle BTC",
    address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as Address,
    decimals: 8,
    accent: "#F7931A",
  },
  // NOTE: USDT and DAI are intentionally excluded — their Arc Mainnet addresses
  // have not been verified. Add them once confirmed from https://docs.arc.io
};

export function getArcTokens(isMainnet: boolean = IS_ARC_MAINNET): Record<string, ArcToken> {
  return isMainnet ? ARC_MAINNET_TOKENS : ARC_TESTNET_TOKENS;
}

export const ARC_TOKENS: Record<string, ArcToken> = IS_ARC_MAINNET
  ? ARC_MAINNET_TOKENS
  : ARC_TESTNET_TOKENS;

export type ArcTokenSymbol = string;

export const TOKEN_LIST: ArcToken[] = Object.values(ARC_TOKENS);

/** Tokens the on-chain Arc DEX router can quote/route today. */
export const SWAP_SYMBOLS: ArcTokenSymbol[] = ["USDC", "EURC", "cirBTC"];

export function getToken(symbol: string, isMainnet: boolean = IS_ARC_MAINNET): ArcToken {
  const tokens = getArcTokens(isMainnet);
  const t = tokens[symbol] || ARC_TOKENS[symbol];
  if (!t) throw new Error(`Unknown Arc token: ${symbol}`);
  return t;
}

/**
 * AGFusionDisperse batch-send contract address. Populated after the user
 * deploys contracts/src/AGFusionDisperse.sol and sets the env var. Empty until
 * then — the Batch panel falls back to sequential sends automatically.
 */
export const DISPERSE_ADDRESS = (
  process.env.NEXT_PUBLIC_AGFUSION_DISPERSE_ADDRESS || ""
).trim();

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isDisperseConfigured(): boolean {
  return isAddress(DISPERSE_ADDRESS);
}

/** Bridge routes offered in the UI (Circle CCTP pairs). */
export const ARC_TESTNET_BRIDGE_ROUTES: { from: string; to: string; label: string }[] = [
  { from: "Arc_Testnet", to: "Base_Sepolia", label: "Arc Testnet → Base Sepolia" },
  { from: "Base_Sepolia", to: "Arc_Testnet", label: "Base Sepolia → Arc Testnet" },
  { from: "Arc_Testnet", to: "Ethereum_Sepolia", label: "Arc Testnet → Ethereum Sepolia" },
  { from: "Ethereum_Sepolia", to: "Arc_Testnet", label: "Ethereum Sepolia → Arc Testnet" },
  { from: "Arc_Testnet", to: "Arbitrum_Sepolia", label: "Arc Testnet → Arbitrum Sepolia" },
  { from: "Arbitrum_Sepolia", to: "Arc_Testnet", label: "Arbitrum Sepolia → Arc Testnet" },
  { from: "Arc_Testnet", to: "Optimism_Sepolia", label: "Arc Testnet → OP Sepolia" },
  { from: "Optimism_Sepolia", to: "Arc_Testnet", label: "OP Sepolia → Arc Testnet" },
];

export const ARC_MAINNET_BRIDGE_ROUTES: { from: string; to: string; label: string }[] = [
  { from: "Arc_Mainnet", to: "Base", label: "Arc Mainnet → Base" },
  { from: "Base", to: "Arc_Mainnet", label: "Base → Arc Mainnet" },
  { from: "Arc_Mainnet", to: "Ethereum", label: "Arc Mainnet → Ethereum" },
  { from: "Ethereum", to: "Arc_Mainnet", label: "Ethereum → Arc Mainnet" },
  { from: "Arc_Mainnet", to: "Arbitrum", label: "Arc Mainnet → Arbitrum" },
  { from: "Arbitrum", to: "Arc_Mainnet", label: "Arbitrum → Arc Mainnet" },
  { from: "Arc_Mainnet", to: "Optimism", label: "Arc Mainnet → Optimism" },
  { from: "Optimism", to: "Arc_Mainnet", label: "Optimism → Arc Mainnet" },
];

export function getBridgeRoutes(isMainnet: boolean = IS_ARC_MAINNET) {
  return isMainnet ? ARC_MAINNET_BRIDGE_ROUTES : ARC_TESTNET_BRIDGE_ROUTES;
}

export const BRIDGE_ROUTES = IS_ARC_MAINNET ? ARC_MAINNET_BRIDGE_ROUTES : ARC_TESTNET_BRIDGE_ROUTES;
