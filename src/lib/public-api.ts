/**
 * Helpers to keep API responses safe for public internet.
 */

/** Generic client-facing errors — never leak stack / paths / SQL */
export function publicError(
  code: string,
  status: number,
  friendly?: string,
): Response {
  return Response.json(
    {
      error: code,
      message: friendly || "Request could not be completed.",
    },
    { status },
  );
}

/** Strip sensitive fields from agent tool traces before sending to browser */
export function redactToolTrace(
  trace: Array<{ name: string; summary: string; ok: boolean }> | undefined,
): Array<{ name: string; ok: boolean }> | undefined {
  if (!trace?.length) return undefined;
  return trace.map((t) => ({
    name: t.name,
    ok: t.ok,
    // summary omitted — often contains addresses, amounts, routes
  }));
}

export function redactTransactionForClient(tx: Record<string, unknown>) {
  // Keep only fields needed for UI; drop bridgeResult and raw steps data noise
  const {
    id,
    type,
    status,
    amount,
    token,
    tokenOut,
    fromChain,
    toChain,
    recipient,
    recipientLabel,
    feeUsd,
    txHash,
    explorerUrl,
    executionMode,
    message,
    steps,
    createdAt,
  } = tx as {
    id?: string;
    type?: string;
    status?: string;
    amount?: string;
    token?: string;
    tokenOut?: string;
    fromChain?: string;
    toChain?: string;
    recipient?: string;
    recipientLabel?: string;
    feeUsd?: number;
    txHash?: string;
    explorerUrl?: string;
    executionMode?: string;
    message?: string;
    steps?: Array<{ name: string; state: string }>;
    createdAt?: string;
  };

  return {
    id,
    type,
    status,
    amount,
    token,
    tokenOut,
    fromChain,
    toChain,
    recipient,
    recipientLabel,
    feeUsd,
    txHash,
    explorerUrl,
    executionMode,
    message: message && !/error|stack|path|prisma|sql/i.test(message)
      ? message
      : undefined,
    steps: Array.isArray(steps)
      ? steps.map((s) => ({ name: s.name, state: s.state }))
      : [],
    createdAt,
  };
}
