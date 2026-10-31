const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type X402RecipientConfig =
  | { ok: true; recipient: string }
  | { ok: false; reason: "missing_recipient" | "invalid_recipient" };

/**
 * Resolve the settlement recipient exclusively from a server-only variable.
 * Never fall back to a public build-time variable or a hard-coded wallet.
 */
export function getX402Recipient(): X402RecipientConfig {
  const configured = process.env.AGFUSION_X402_RECIPIENT?.trim();

  if (!configured) {
    return { ok: false, reason: "missing_recipient" };
  }

  if (!ADDRESS_RE.test(configured)) {
    return { ok: false, reason: "invalid_recipient" };
  }

  return { ok: true, recipient: configured.toLowerCase() };
}
