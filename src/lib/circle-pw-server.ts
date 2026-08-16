/**
 * Server-only helpers for Circle Programmable Wallets API routes.
 *
 * Security rules:
 * - CIRCLE_API_KEY is read here and never exposed to the client.
 * - Every walletId submitted from the browser is verified to belong to the
 *   Circle user behind the supplied userToken before any contract call is
 *   prepared — "user A token + user B walletId" is impossible.
 * - All inputs are strictly validated (address / hex / value / blockchain /
 *   email) before being forwarded to Circle.
 */

import { isAddress } from "viem";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

/** Blockchains Circle Programmable Wallets may execute on in this app. */
export const CIRCLE_ALLOWED_BLOCKCHAINS = new Set([
  "ARC-TESTNET",
  "BASE-SEPOLIA",
]);

/** Chain id → Circle PW blockchain string (mirrors client circle-pw.ts). */
export function circleBlockchainForChainId(chainId: number): string | null {
  if (chainId === 5042002) return "ARC-TESTNET";
  if (chainId === 84532) return "BASE-SEPOLIA";
  return null;
}

/** Server-only — never return this to the browser. */
export function getCircleApiKey(): string | null {
  return process.env.CIRCLE_API_KEY?.trim() || null;
}

/** Valid EVM address (loose checksum tolerance, matching viem usage elsewhere). */
export function isValidEthereumAddress(v: unknown): boolean {
  return typeof v === "string" && isAddress(v as `0x${string}`, { strict: false });
}

/** Valid hex call-data: 0x-prefixed, even-length, hex characters. */
export function isValidHexData(v: unknown, maxLen = 100_000): boolean {
  if (typeof v !== "string") return false;
  if (v.length > maxLen) return false;
  if (!/^0x[0-9a-fA-F]*$/.test(v)) return false;
  return v.length % 2 === 0;
}

/** Valid value: absent / "0x0" / "0" / decimal or hex non-negative. */
export function isValidValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  const s = String(v);
  if (s === "0x0" || s === "0") return true;
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(s)) return false;
  try {
    return BigInt(s) >= BigInt(0);
  } catch {
    return false;
  }
}

export function isValidBlockchain(v: unknown): v is string {
  return typeof v === "string" && CIRCLE_ALLOWED_BLOCKCHAINS.has(v);
}

export function isValidEmail(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  );
}

export function isValidUserToken(v: unknown): v is string {
  return typeof v === "string" && v.length >= 8 && v.length <= 4000;
}

type OwnedWallet = { id: string; blockchain: string };

/**
 * Verify that `walletId` belongs to the Circle user authenticated by
 * `userToken` (scoped query, never a client-supplied identity). Also returns
 * the wallet's blockchain so callers can enforce chain eligibility.
 */
export async function fetchOwnedWallet(
  userToken: string,
  walletId: string,
): Promise<
  | { ok: true; wallet: OwnedWallet }
  | { ok: false; reason: string; status: number }
> {
  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return { ok: false, reason: "CIRCLE_API_KEY is not configured", status: 500 };
  }
  try {
    const res = await fetch(
      `${CIRCLE_API_BASE}/wallets?walletId=${encodeURIComponent(walletId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-User-Token": userToken,
        },
        cache: "no-store",
      },
    );
    const data = (await res.json().catch(() => null)) as {
      message?: string;
      data?: { wallets?: Array<{ id?: string; blockchain?: string }> };
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        reason: data?.message || "Circle wallet lookup failed",
        status: res.status,
      };
    }
    const wallets = data?.data?.wallets || [];
    const owned = wallets.find((w) => String(w.id) === String(walletId));
    if (!owned?.id) {
      return {
        ok: false,
        reason: "Wallet does not belong to this Circle user",
        status: 403,
      };
    }
    return {
      ok: true,
      wallet: { id: owned.id, blockchain: owned.blockchain || "" },
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "wallet ownership check failed",
      status: 502,
    };
  }
}
