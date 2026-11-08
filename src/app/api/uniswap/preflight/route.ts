import { NextResponse } from "next/server";
import { formatUnits, isAddress, parseUnits } from "viem";
import { buildExactPermit2Approval, readArcMainnetPermit2Preflight, ARC_MAINNET_SWAP_TOKENS } from "@/blockchain/uniswap-permit2-preflight";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_DECIMALS = { USDC: 6, EURC: 6, cirBTC: 8 } as const;
type TokenSymbol = keyof typeof TOKEN_DECIMALS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  const rl = rateLimit(`uniswap-arc-preflight:${clientIp(req)}`, { windowMs: 60_000, max: 20 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = await readLimitedJson(req, 4 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: parsed.reason === "too_large" ? 413 : 400 },
    );
  }
  if (!isRecord(parsed.value)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const body = parsed.value;
  const account = String(body.address || "").trim();
  const tokenIn = String(body.tokenIn || "") as TokenSymbol;
  const amount = String(body.amount || "").trim();
  if (!isAddress(account)) return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
  if (!Object.prototype.hasOwnProperty.call(TOKEN_DECIMALS, tokenIn)) {
    return NextResponse.json({ error: "unsupported_swap_token" }, { status: 400 });
  }
  if (Number(body.chainId) !== 5042) return NextResponse.json({ error: "unsupported_swap_chain" }, { status: 400 });
  if (!/^\d+(?:\.\d+)?$/.test(amount) || amount.length > 80 || (amount.split(".")[1] || "").length > TOKEN_DECIMALS[tokenIn]) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  let amountBaseUnits: bigint;
  try {
    amountBaseUnits = parseUnits(amount, TOKEN_DECIMALS[tokenIn]);
  } catch {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (amountBaseUnits <= 0n || amountBaseUnits >= (1n << 160n)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  try {
    const token = ARC_MAINNET_SWAP_TOKENS[tokenIn];
    const state = await readArcMainnetPermit2Preflight({ account, token, amount: amountBaseUnits });
    const approval = state.requiresErc20Approval
      ? buildExactPermit2Approval(account, token, amountBaseUnits)
      : null;

    return NextResponse.json({
      ok: true,
      chainId: 5042,
      address: state.account,
      tokenIn,
      amount,
      tokenBalance: formatUnits(state.tokenBalance, TOKEN_DECIMALS[tokenIn]),
      nativeGasBalance: formatUnits(state.nativeGasBalance, 18),
      erc20AllowanceToPermit2: state.erc20AllowanceToPermit2.toString(),
      permit2AllowanceToRouter: state.permit2AllowanceToRouter.toString(),
      permit2Expiration: state.permit2Expiration,
      permit2Nonce: state.permit2Nonce,
      hasTokenBalance: state.hasTokenBalance,
      hasGasReserve: state.hasGasReserve,
      requiresErc20Approval: state.requiresErc20Approval,
      requiresPermit2Signature: state.requiresPermit2Signature,
      readyForSwapAfterPermit: state.readyForSwapAfterPermit,
      approvalTransaction: approval ? {
        chainId: approval.chainId,
        from: approval.from,
        to: approval.to,
        data: approval.data,
        value: approval.value,
        spender: approval.spender,
        amount: approval.amount.toString(),
      } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("[AGFusion] Arc Mainnet Permit2 preflight unavailable", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "mainnet_preflight_unavailable" }, { status: 503 });
  }
}
