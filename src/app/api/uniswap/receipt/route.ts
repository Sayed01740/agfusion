import { NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import { decryptArcUniswapReceiptTicket } from "@/blockchain/uniswap-quote-session";
import { verifyArcMainnetSwapReceipt } from "@/blockchain/uniswap-receipt-verification";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  const rl = rateLimit(`uniswap-arc-receipt:${clientIp(req)}`, { windowMs: 60_000, max: 12 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = await readLimitedJson(req, 8 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: parsed.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!isRecord(parsed.value)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const ticketToken = typeof parsed.value.receiptVerificationTicket === "string"
    ? parsed.value.receiptVerificationTicket
    : "";
  const hash = typeof parsed.value.transactionHash === "string"
    ? parsed.value.transactionHash
    : "";
  if (!ticketToken) return NextResponse.json({ error: "receipt_verification_ticket_required" }, { status: 400 });
  if (!isHash(hash)) return NextResponse.json({ error: "invalid_transaction_hash" }, { status: 400 });

  let ticket;
  try {
    ticket = decryptArcUniswapReceiptTicket(ticketToken);
  } catch {
    return NextResponse.json({ error: "invalid_or_expired_receipt_ticket" }, { status: 400 });
  }
  if (
    !isAddress(ticket.account) ||
    ticket.chainId !== 5042 ||
    BigInt(ticket.amountIn) <= 0n ||
    BigInt(ticket.minimumAmountOut) <= 0n
  ) {
    return NextResponse.json({ error: "invalid_receipt_ticket_binding" }, { status: 400 });
  }

  try {
    const result = await verifyArcMainnetSwapReceipt({
      hash,
      account: ticket.account,
      tokenIn: ticket.tokenIn,
      tokenOut: ticket.tokenOut,
      amountIn: BigInt(ticket.amountIn),
      minimumAmountOut: BigInt(ticket.minimumAmountOut),
    });
    return NextResponse.json({
      ok: true,
      ...result,
      inputSpent: result.inputSpent.toString(),
      outputReceived: result.outputReceived.toString(),
      blockNumber: result.blockNumber.toString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    if (errorName.includes("NotFound")) {
      return NextResponse.json({ ok: false, status: "pending" }, { status: 202, headers: { "Retry-After": "3" } });
    }
    if (error instanceof Error && error.message.startsWith("Arc Mainnet receipt verification failed:")) {
      return NextResponse.json({ error: "receipt_verification_failed" }, { status: 422 });
    }
    console.warn("[AGFusion] Arc Mainnet receipt lookup unavailable", { errorName });
    return NextResponse.json({ error: "receipt_verification_unavailable" }, { status: 503 });
  }
}
