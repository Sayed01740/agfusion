/** Parse RPC chain IDs safely and compare them to an expected decimal chain ID. */
export function matchesExpectedChainId(
  value: unknown,
  expectedChainId: number,
): boolean {
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) return false;

  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;

  const parsed = /^0x[0-9a-f]+$/.test(raw)
    ? Number(raw)
    : /^\d+$/.test(raw)
      ? Number(raw)
      : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed === expectedChainId;
}
