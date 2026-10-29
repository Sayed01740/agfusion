/**
 * Arc Mainnet swaps must not use illustrative prices as executable quotes.
 * Enable these only after a real quote provider and settlement contract have
 * been independently verified and covered by integration tests.
 */
export const MAINNET_SWAP_READINESS = {
  liveQuoteProviderConfigured: false,
  settlementContractVerified: false,
} as const;

export const MAINNET_SWAP_NOT_READY_MESSAGE =
  "Arc Mainnet swaps are disabled until a verified live quote provider and settlement contract are configured. No transaction was submitted.";

export function assertMainnetSwapReady(isMainnet: boolean): void {
  if (
    isMainnet &&
    (!MAINNET_SWAP_READINESS.liveQuoteProviderConfigured ||
      !MAINNET_SWAP_READINESS.settlementContractVerified)
  ) {
    throw new Error(MAINNET_SWAP_NOT_READY_MESSAGE);
  }
}
