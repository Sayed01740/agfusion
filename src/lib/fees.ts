/**
 * Arc-style fee presentation: gas as a dollar line item (USDC), not a market variable.
 * Aligns with Arc public messaging on predictable USDC-native costs.
 */

export type FeeLineItem = {
  id: string;
  label: string;
  amountUsdc: number;
  note?: string;
};

export type FeeQuote = {
  /** Total in USDC (≈ USD on Arc) */
  totalUsdc: number;
  currency: "USDC";
  lineItems: FeeLineItem[];
  /** Human label for UI */
  headline: string;
  /** Arc network tip */
  tip: string;
};

const ARC_BASE_GAS = 0.04; // illustrative Arc testnet avg messaging
const BRIDGE_PROTOCOL = 0.08;
const SWAP_PROTOCOL = 0.05;
const SEND_PROTOCOL = 0.0;
const X402_BASE = 0.001;

export function formatUsdc(amount: number, digits = 4): string {
  if (!Number.isFinite(amount)) return "— USDC";
  if (amount === 0) return "0 USDC";
  if (amount > 0 && amount < 0.0001) return "<0.0001 USDC";
  return `${amount.toFixed(digits)} USDC`;
}

/** ~Arc public messaging: fees denominated in digital dollars */
export function quoteSendFee(amount?: string): FeeQuote {
  const gas = ARC_BASE_GAS;
  return {
    totalUsdc: gas + SEND_PROTOCOL,
    currency: "USDC",
    lineItems: [
      {
        id: "gas",
        label: "Network gas (USDC)",
        amountUsdc: gas,
        note: "Native gas on Arc — no separate ETH token",
      },
    ],
    headline: formatUsdc(gas + SEND_PROTOCOL),
    tip: "Gas is a line item in USDC, not a volatile token market.",
  };
}

export function quoteBridgeFee(amount?: string): FeeQuote {
  const n = Math.max(0, Number(amount) || 0);
  const gas = ARC_BASE_GAS;
  const protocol = BRIDGE_PROTOCOL + (n > 0 ? Math.min(n * 0.0001, 0.05) : 0);
  const total = gas + protocol;
  return {
    totalUsdc: total,
    currency: "USDC",
    lineItems: [
      {
        id: "protocol",
        label: "Cross-chain protocol",
        amountUsdc: protocol,
      },
      {
        id: "gas",
        label: "Arc settlement gas (USDC)",
        amountUsdc: gas,
      },
    ],
    headline: formatUsdc(total),
    tip: "Predictable dollar-based costs for transfer + settlement.",
  };
}

export function quoteSwapFee(amount?: string): FeeQuote {
  const n = Math.max(0, Number(amount) || 0);
  const gas = ARC_BASE_GAS;
  const protocol = SWAP_PROTOCOL + (n > 0 ? Math.min(n * 0.0002, 0.08) : 0);
  const total = gas + protocol;
  return {
    totalUsdc: total,
    currency: "USDC",
    lineItems: [
      { id: "fx", label: "Stablecoin FX / liquidity", amountUsdc: protocol },
      { id: "gas", label: "Network gas (USDC)", amountUsdc: gas },
    ],
    headline: formatUsdc(total),
    tip: "USDC ↔ EURC with transparent, USDC-denominated fees.",
  };
}

export function quoteX402Fee(tool = "risk_oracle"): FeeQuote {
  const amount = X402_BASE;
  return {
    totalUsdc: amount,
    currency: "USDC",
    lineItems: [
      {
        id: "x402",
        label: `x402 micropayment · ${tool}`,
        amountUsdc: amount,
        note: "HTTP 402 · agent-payable API on Arc",
      },
    ],
    headline: formatUsdc(amount, 6),
    tip: "Machine-to-machine payment — sub-cent, USDC on Arc.",
  };
}

export function quotePayrollBatchFee(recipientCount: number): FeeQuote {
  const count = Math.max(1, recipientCount);
  const gas = ARC_BASE_GAS * count;
  return {
    totalUsdc: gas,
    currency: "USDC",
    lineItems: [
      {
        id: "batch_gas",
        label: `Batch gas × ${count} payouts`,
        amountUsdc: gas,
      },
    ],
    headline: formatUsdc(gas),
    tip: "Scheduled / multi-send payroll — each leg settles in USDC gas.",
  };
}

export function feeFromUsd(feeUsd?: number): FeeQuote {
  const n = typeof feeUsd === "number" ? feeUsd : ARC_BASE_GAS;
  return {
    totalUsdc: n,
    currency: "USDC",
    lineItems: [
      { id: "total", label: "Estimated total (USDC)", amountUsdc: n },
    ],
    headline: formatUsdc(n),
    tip: "Quoted in USDC on Arc — budgetable by finance teams.",
  };
}
