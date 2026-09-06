/**
 * Arc Testnet token registry for the AGFusion dApp.
 *
 * Addresses are pinned to the same values the production swap path uses
 * (src/blockchain/production-swap.ts). USDC is the native gas asset on Arc and
 * is exposed as a 6-decimal ERC-20 at 0x3600…0000.
 */
import type { Address } from "viem";

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

/** Canonical Arc USDC ERC-20 interface (6 decimals). */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as Address;

export const ARC_TOKENS: Record<string, ArcToken> = {
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

export type ArcTokenSymbol = keyof typeof ARC_TOKENS;

export const TOKEN_LIST: ArcToken[] = Object.values(ARC_TOKENS);

/** Tokens the on-chain Arc DEX router can quote/route today. */
export const SWAP_SYMBOLS: ArcTokenSymbol[] = ["USDC", "EURC", "cirBTC"];

export function getToken(symbol: string): ArcToken {
  const t = ARC_TOKENS[symbol];
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

/** Bridge routes offered in the UI (Circle CCTP testnet pairs). */
export const BRIDGE_ROUTES: { from: string; to: string; label: string }[] = [
  { from: "Arc_Testnet", to: "Base_Sepolia", label: "Arc → Base Sepolia" },
  { from: "Base_Sepolia", to: "Arc_Testnet", label: "Base Sepolia → Arc" },
];
