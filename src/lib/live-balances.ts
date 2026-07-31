/**
 * Build a unified balance snapshot from live Arc RPC + optional client values.
 */

import type { UnifiedBalanceSnapshot } from "@/types";

export function snapshotFromArcUsdc(
  amountStr: string | null | undefined,
  address?: string | null,
): UnifiedBalanceSnapshot {
  const n = Number(String(amountStr || "0").replace(/,/g, ""));
  const amount = Number.isFinite(n) ? n : 0;
  return {
    totalUsd: amount,
    balances: [
      {
        chain: "Arc_Testnet",
        chainLabel: "Arc Testnet",
        token: "USDC",
        amount,
        usdValue: amount,
        color: "#22d3ee",
      },
    ],
    updatedAt: new Date().toISOString(),
    // not in type but harmless if extra - don't add extra fields
  };
}

export async function fetchLiveArcBalance(
  address: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/balances?address=${encodeURIComponent(address)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.balances?.[0];
    if (row?.amount != null) return String(row.amount);
    if (typeof data?.totalUsd === "number") return String(data.totalUsd);
    return null;
  } catch {
    return null;
  }
}
