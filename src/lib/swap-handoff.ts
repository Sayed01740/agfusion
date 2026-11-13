/**
 * Chat Agent → Swap panel handoff.
 *
 * On Arc Mainnet the swap is a multi-step Uniswap/Permit2 flow (approve →
 * EIP-712 signature → broadcast) that lives in ProductionSwapPanel. The chat
 * agent cannot run it headlessly, so it hands the planned swap over to the
 * panel, which pre-fills the form and fetches a live quote automatically.
 */

export type SwapHandoff = {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  autoQuote?: boolean;
};

export const SWAP_HANDOFF_EVENT = "agfusion:swap-handoff";
const STORAGE_KEY = "agfusion_swap_handoff_v1";

export function publishSwapHandoff(request: SwapHandoff): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request));
  } catch {
    /* storage unavailable — event alone still works for mounted panels */
  }
  window.dispatchEvent(new CustomEvent<SwapHandoff>(SWAP_HANDOFF_EVENT, { detail: request }));
}

/** Read and clear a pending handoff (used when the panel mounts after the event). */
export function consumeSwapHandoff(): SwapHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as SwapHandoff;
    if (!parsed || typeof parsed.amount !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSwapHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

