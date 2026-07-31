import type { UnifiedBalanceSnapshot } from "@/types";

/** Real empty snapshot — never seed UI with fake multi-chain demo numbers. */
export function emptyBalanceSnapshot(): UnifiedBalanceSnapshot {
  return {
    totalUsd: 0,
    balances: [
      {
        chain: "Arc_Testnet",
        chainLabel: "Arc Testnet",
        token: "USDC",
        amount: 0,
        usdValue: 0,
        color: "#22d3ee",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function isValidEvmAddress(value: string | null | undefined): boolean {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value.trim()));
}

/** Burn / synthetic addresses used by old demos — never send real funds here. */
export function isUnsafeDemoRecipient(address: string): boolean {
  const a = address.toLowerCase();
  return (
    a === "0x5a4a000000000000000000000000000000005a4a" ||
    a === "0xa11e00000000000000000000000000000000a11e" ||
    a === "0x0000000000000000000000000000000000000001" ||
    a === "0x0000000000000000000000000000000000000000" ||
    /^0x[0-9a-f]{8}d{32}$/i.test(a) // name-hash synthetic pattern
  );
}

export function requireSafeRecipient(
  address: string | null | undefined,
  label?: string,
): string {
  const a = (address || "").trim();
  if (!isValidEvmAddress(a)) {
    throw new Error(
      label
        ? `Need a real 0x address for “${label}”. Paste a full Arc Testnet address (42 chars) before confirming.`
        : "Paste a full 0x recipient address (42 characters) before sending live USDC.",
    );
  }
  if (isUnsafeDemoRecipient(a)) {
    throw new Error(
      "That address is a demo placeholder. Paste a wallet you control so testnet USDC is not lost.",
    );
  }
  return a;
}
