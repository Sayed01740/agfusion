import { parseUnits, formatUnits } from "viem";

export const USDC_ERC20_DECIMALS = 6;
export const ARC_NATIVE_GAS_DECIMALS = 18;

const SCALE_FACTOR = 10n ** 12n; // Difference between 18 and 6 decimals

/**
 * Standard parser for user-entered USDC amounts.
 * Always parses into canonical 6-decimal ERC-20 units.
 */
export function parseUsdc(input: string | number): { raw: bigint; formatted: string } {
  const clean = String(input ?? "").trim().replace(/,/g, "");
  if (!clean || !/^\d+(\.\d+)?$/.test(clean) || Number(clean) < 0) {
    throw new Error(`Invalid USDC input: "${input}". Must be a non-negative number.`);
  }

  // Cap decimals at 6 to prevent precision overflow errors
  const [whole, fraction = ""] = clean.split(".");
  const trimmed = fraction.length > USDC_ERC20_DECIMALS
    ? `${whole}.${fraction.slice(0, USDC_ERC20_DECIMALS)}`
    : clean;

  const raw = parseUnits(trimmed, USDC_ERC20_DECIMALS);
  return {
    raw,
    formatted: formatUnits(raw, USDC_ERC20_DECIMALS),
  };
}

/**
 * Format 6-decimal raw ERC-20 USDC units into human-readable string.
 */
export function formatUsdc(raw: bigint): string {
  return formatUnits(raw, USDC_ERC20_DECIMALS);
}

/**
 * Parse native Arc gas asset (for msg.value, createTaskNative, eth_getBalance).
 * Uses 18-decimal view.
 */
export function parseGasAmount(input: string | number): { raw: bigint; formatted: string } {
  const clean = String(input ?? "").trim().replace(/,/g, "");
  if (!clean || !/^\d+(\.\d+)?$/.test(clean) || Number(clean) < 0) {
    throw new Error(`Invalid gas input: "${input}". Must be a non-negative number.`);
  }

  const raw = parseUnits(clean, ARC_NATIVE_GAS_DECIMALS);
  return {
    raw,
    formatted: formatUnits(raw, ARC_NATIVE_GAS_DECIMALS),
  };
}

/**
 * Format 18-decimal raw native Arc gas units into human-readable string.
 */
export function formatGasAmount(raw: bigint): string {
  return formatUnits(raw, ARC_NATIVE_GAS_DECIMALS);
}

/**
 * Decimals helper for Arc's dual view.
 */
export function usdcDecimalsFor(view: "erc20" | "native"): number {
  return view === "native" ? ARC_NATIVE_GAS_DECIMALS : USDC_ERC20_DECIMALS;
}

/**
 * Convert 6-decimal ERC-20 units to 18-decimal native gas view.
 */
export function usdcToGasToken(amountErc20Units: bigint): bigint {
  return amountErc20Units * SCALE_FACTOR;
}

/**
 * Convert 18-decimal native gas units to 6-decimal ERC-20 view.
 */
export function gasTokenToUsdc(amountNativeUnits: bigint): bigint {
  return amountNativeUnits / SCALE_FACTOR;
}
