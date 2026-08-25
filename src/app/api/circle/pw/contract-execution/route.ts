import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  circleBlockchainForChainId,
  fetchOwnedWallet,
  getCircleApiKey,
  isValidEthereumAddress,
  isValidHexData,
  isValidUserToken,
  isValidValue,
} from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a user-controlled-wallet contract-execution challenge.
 * The browser must execute the returned challenge through Circle's Web SDK;
 * the server never receives the user's signing material.
 *
 * Authorization: the walletId is verified to belong to the Circle user behind
 * userToken, and the wallet's blockchain must match the requested chainId.
 *
 * Circle's contractExecution API expects `amount` in human-readable native
 * token units, not the EVM wei/base-unit integer used by the browser `value`.
 * Arc's native gas asset is USDC with 18 decimals, so a 1 USDC payable call
 * must send amount="1", not "1000000000000000000".
 */
export async function POST(req: Request) {
  const rl = rateLimit(`circle-exec:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 12,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    userToken?: unknown;
    walletId?: unknown;
    contractAddress?: unknown;
    callData?: unknown;
    value?: unknown;
    chainId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidUserToken(body.userToken)) {
    return NextResponse.json({ error: "invalid_user_token" }, { status: 400 });
  }
  if (typeof body.walletId !== "string" || !body.walletId.trim()) {
    return NextResponse.json({ error: "invalid_wallet_id" }, { status: 400 });
  }
  if (!isValidEthereumAddress(body.contractAddress)) {
    return NextResponse.json({ error: "invalid_contract_address" }, { status: 400 });
  }
  if (!isValidHexData(body.callData)) {
    return NextResponse.json({ error: "invalid_call_data" }, { status: 400 });
  }
  if (!isValidValue(body.value)) {
    return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  }

  let chainId: number | undefined;
  if (body.chainId !== undefined && body.chainId !== null) {
    chainId = Number(body.chainId);
    if (!Number.isInteger(chainId) || !circleBlockchainForChainId(chainId)) {
      return NextResponse.json({ error: "unsupported_chain" }, { status: 400 });
    }
  }

  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "CIRCLE_API_KEY is not configured" }, { status: 500 });
  }

  const owned = await fetchOwnedWallet(body.userToken, body.walletId);
  if (!owned.ok) {
    console.warn("[Circle PW] wallet ownership rejected", {
      status: owned.status,
      reason: owned.reason,
    });
    return NextResponse.json(
      { error: "unauthorized_wallet", message: owned.reason },
      { status: owned.status === 502 ? 502 : 403 },
    );
  }
  if (chainId) {
    const expectedBlockchain = circleBlockchainForChainId(chainId);
    if (owned.wallet.blockchain !== expectedBlockchain) {
      return NextResponse.json(
        {
          error: "wallet_chain_mismatch",
          message: `Wallet is on ${owned.wallet.blockchain} but chain ${chainId} (${expectedBlockchain}) was requested.`,
        },
        { status: 409 },
      );
    }
  }

  const requestId = randomUUID();

  try {
    const hasNativeValue =
      body.value !== undefined &&
      body.value !== null &&
      body.value !== "" &&
      body.value !== "0x0" &&
      body.value !== "0";

    let nativeAmount: string | undefined;
    if (hasNativeValue) {
      const baseUnits = BigInt(String(body.value));
      nativeAmount = formatUnits(baseUnits, 18);
      if (Number(nativeAmount) <= 0) nativeAmount = undefined;
    }

    console.info("[Circle PW] contract execution request", {
      requestId,
      walletId: body.walletId,
      chainId: chainId ?? null,
      blockchain: owned.wallet.blockchain,
      contractAddress: body.contractAddress,
      nativeAmount: nativeAmount ?? "0",
    });

    const response = await fetch("https://api.circle.com/v1/w3s/user/transactions/contractExecution", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-User-Token": body.userToken,
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        idempotencyKey: requestId,
        walletId: body.walletId,
        contractAddress: body.contractAddress,
        callData: body.callData,
        ...(nativeAmount ? { amount: nativeAmount } : {}),
        feeLevel: "MEDIUM",
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("[Circle PW] contract execution rejected", {
        requestId,
        status: response.status,
        message: data?.message || "unknown",
        code: data?.code || null,
      });
      return NextResponse.json(
        {
          error: data?.message || "Circle could not create the transaction challenge.",
          requestId,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      challengeId: data?.data?.challengeId,
      walletId: body.walletId,
      requestId,
    });
  } catch (error) {
    console.error("[Circle PW] Contract execution challenge error:", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Could not prepare the Circle transaction.", requestId },
      { status: 500 },
    );
  }
}
