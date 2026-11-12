import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { validateArcMainnetSwapTransaction } from "@/blockchain/uniswap-mainnet-adapter";
import { validateArcPermit2Signature } from "@/blockchain/uniswap-permit2";
import {
  buildExactPermit2Approval,
  readArcMainnetPermit2Preflight,
  simulateArcMainnetSwapTransaction,
} from "@/blockchain/uniswap-permit2-preflight";
import { createArcUniswapReceiptTicket, decryptArcUniswapQuoteSession } from "@/blockchain/uniswap-quote-session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consumeArcQuoteSession } from "@/lib/arc-quote-session-store";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNISWAP_SWAP_URL = "https://trade-api.gateway.uniswap.org/v1/swap";
const UNIVERSAL_ROUTER_VERSION = "2.1.2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMainnetExecutionEnabled(): boolean {
  return process.env.AGFUSION_MAINNET_SWAP_EXECUTION_ENABLED?.trim().toLowerCase() === "true";
}

function isMainnetPreparationEnabled(): boolean {
  return (
    isMainnetExecutionEnabled() ||
    (process.env.AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED?.trim().toLowerCase() === "true" &&
      process.env.VERCEL_ENV?.trim().toLowerCase() === "preview")
  );
}

/** Read-only release gate used by the browser before requesting a Permit2 signature. */
export async function GET() {
  return NextResponse.json(
    { enabled: isMainnetPreparationEnabled(), executionEnabled: isMainnetExecutionEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`uniswap-arc-swap-prepare:${clientIp(req)}`, { windowMs: 60_000, max: 8 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Transaction preparation stays disabled unless explicitly enabled for a controlled
  // Preview review. This flag does not enable wallet signing or transaction broadcast.
  if (!isMainnetPreparationEnabled()) {
    return NextResponse.json({ error: "mainnet_swap_preparation_disabled" }, { status: 403 });
  }

  const parsed = await readLimitedJson(req, 112 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: parsed.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!isRecord(parsed.value)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const body = parsed.value;
  const sessionToken = typeof body.quoteSession === "string" ? body.quoteSession : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!sessionToken) return NextResponse.json({ error: "quote_session_required" }, { status: 400 });

  let session;
  try {
    session = decryptArcUniswapQuoteSession(sessionToken);
  } catch {
    return NextResponse.json({ error: "invalid_or_expired_quote_session" }, { status: 400 });
  }

  if (!isAddress(session.account) || session.chainId !== 5042) {
    return NextResponse.json({ error: "invalid_quote_session_binding" }, { status: 400 });
  }

  const apiKey = process.env.UNISWAP_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "uniswap_api_not_configured" }, { status: 503 });

  const amountIn = BigInt(session.amountIn);
  const now = Math.floor(Date.now() / 1000);
  try {
    const preflight = await readArcMainnetPermit2Preflight({
      account: session.account,
      token: session.tokenIn,
      amount: amountIn,
      nowSeconds: now,
    });

    if (!preflight.hasTokenBalance) {
      return NextResponse.json({ error: "insufficient_input_token_balance" }, { status: 409 });
    }
    if (!preflight.hasGasReserve) {
      return NextResponse.json({ error: "insufficient_native_gas_reserve" }, { status: 409 });
    }
    if (preflight.requiresErc20Approval) {
      const approval = buildExactPermit2Approval(session.account, session.tokenIn, amountIn);
      return NextResponse.json({
        error: "erc20_permit2_approval_required",
        approvalTransaction: {
          chainId: approval.chainId,
          from: approval.from,
          to: approval.to,
          data: approval.data,
          value: approval.value,
          spender: approval.spender,
          amount: approval.amount.toString(),
        },
        detail: "Approve the exact input amount to Permit2, wait for confirmation, then request a fresh quote.",
      }, { status: 409 });
    }

    let requestBody: Record<string, unknown> = {
      quote: session.quote,
      safetyMode: "SAFE",
      deadline: now + 10 * 60,
      simulateTransaction: true,
      refreshGasPrice: true,
    };

    if (session.permitData) {
      if (!signature) return NextResponse.json({ error: "permit2_signature_required" }, { status: 400 });
      const permit = await validateArcPermit2Signature(session.permitData, signature, {
        account: session.account,
        token: session.tokenIn,
        amount: amountIn,
        nowSeconds: now,
      });
      if (permit.nonce !== preflight.permit2Nonce) {
        return NextResponse.json({ error: "permit2_nonce_changed_request_new_quote" }, { status: 409 });
      }
      requestBody = { ...requestBody, permitData: session.permitData, signature };
    } else {
      if (signature) return NextResponse.json({ error: "unexpected_permit2_signature" }, { status: 400 });
      if (
        preflight.permit2AllowanceToRouter < amountIn ||
        preflight.permit2Expiration <= now
      ) {
        return NextResponse.json({ error: "permit2_allowance_insufficient_request_new_quote" }, { status: 409 });
      }
    }

    // Consume immediately before the external preparation request. A
    // conditional database update ensures only one concurrent request wins.
    const consumed = await consumeArcQuoteSession({
      token: sessionToken,
      account: session.account,
      chainId: session.chainId,
    });
    if (!consumed.ok) {
      return NextResponse.json(
        { error: consumed.reason === "database_unavailable" ? "quote_session_store_unavailable" : "quote_session_already_used" },
        { status: consumed.reason === "database_unavailable" ? 503 : 409 },
      );
    }

    const upstream = await fetch(UNISWAP_SWAP_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const payload: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok || !isRecord(payload) || !isRecord(payload.swap)) {
      console.warn("[AGFusion] Uniswap swap preparation failed", { status: upstream.status });
      return NextResponse.json({ error: "uniswap_swap_preparation_unavailable" }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const swap = payload.swap;
    const validated = validateArcMainnetSwapTransaction({
      chainId: swap.chainId as number | string,
      from: String(swap.from || ""),
      to: String(swap.to || ""),
      data: String(swap.data || ""),
      value: String(swap.value ?? ""),
      gasLimit: String(swap.gasLimit || ""),
      gasPrice: typeof swap.gasPrice === "string" ? swap.gasPrice : undefined,
      maxFeePerGas: typeof swap.maxFeePerGas === "string" ? swap.maxFeePerGas : undefined,
    }, {
      account: session.account,
      tokenIn: session.tokenIn,
      tokenOut: session.tokenOut,
      amountIn,
      minimumAmountOut: BigInt(session.minimumAmountOut),
      quotedAmountOut: BigInt(session.quotedAmountOut),
      quoteCreatedAt: session.issuedAt,
      nowSeconds: now,
    });

    const maxFeePerGas = typeof swap.maxFeePerGas === "string"
      ? swap.maxFeePerGas
      : String(swap.gasPrice || "");
    const simulation = await simulateArcMainnetSwapTransaction({
      account: session.account,
      to: validated.to,
      data: validated.data,
      ...(validated.value !== "0" ? { value: validated.value } : {}),
      gasLimit: String(swap.gasLimit || ""),
      maxFeePerGas,
      nativeGasBalance: preflight.nativeGasBalance,
    });

    const receiptTicket = createArcUniswapReceiptTicket({
      chainId: 5042,
      account: session.account,
      tokenIn: session.tokenIn,
      tokenOut: session.tokenOut,
      amountIn: session.amountIn,
      minimumAmountOut: session.minimumAmountOut,
    });

    return NextResponse.json({
      ok: true,
      chainId: 5042,
      requestId: typeof payload.requestId === "string" ? payload.requestId : session.requestId,
      quoteSessionExpiresAt: session.expiresAt,
      receiptVerificationTicket: receiptTicket.token,
      receiptVerificationExpiresAt: receiptTicket.expiresAt,
      transaction: {
        chainId: 5042,
        from: validated.from,
        to: validated.to,
        data: validated.data,
        value: validated.value,
        gasLimit: String(swap.gasLimit),
        ...(typeof swap.maxFeePerGas === "string" ? { maxFeePerGas: swap.maxFeePerGas } : {}),
        ...(typeof swap.maxPriorityFeePerGas === "string" ? { maxPriorityFeePerGas: swap.maxPriorityFeePerGas } : {}),
        ...(typeof swap.gasPrice === "string" ? { gasPrice: swap.gasPrice } : {}),
      },
      validation: {
        commandNames: validated.commandNames,
        deadline: validated.deadline.toString(),
        amountIn: validated.amountIn.toString(),
        minimumAmountOut: validated.minimumAmountOut.toString(),
        estimatedGas: simulation.estimatedGas.toString(),
        estimatedGasCost: simulation.estimatedGasCost.toString(),
        requiredNativeBalance: simulation.requiredNativeBalance.toString(),
        upstreamSimulation: "passed",
        localEthCall: "passed",
        localGasEstimate: "passed",
      },
      executionEnabled: isMainnetExecutionEnabled(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("[AGFusion] Arc Mainnet swap preparation rejected", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({
      error: error instanceof Error && error.message.includes("Permit2 authorization rejected")
        ? "permit2_signature_rejected"
        : "mainnet_swap_preparation_rejected",
    }, { status: 422 });
  }
}
