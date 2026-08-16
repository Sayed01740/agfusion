import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

/** Creates a user-controlled-wallet contract-execution challenge.
 * The browser must execute the returned challenge through Circle's Web SDK;
 * the server never receives the user's signing material. */
export async function POST(req: Request) {
  try {
    const { userToken, walletId, contractAddress, callData, value } = await req.json();
    if (!userToken || !walletId || !contractAddress || !callData) {
      return NextResponse.json({ error: "Missing Circle transaction details." }, { status: 400 });
    }

    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "CIRCLE_API_KEY is not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.circle.com/v1/w3s/user/transactions/contractExecution", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        walletId,
        contractAddress,
        callData,
        ...(value && value !== "0x0" && value !== "0" ? { amount: String(BigInt(value)) } : {}),
        feeLevel: "MEDIUM",
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.message || "Circle could not create the transaction challenge." }, { status: response.status });
    }
    // Return the exact challenge id so the browser can match the resulting tx.
    return NextResponse.json({
      challengeId: data?.data?.challengeId,
      walletId,
    });
  } catch (error) {
    console.error("[Circle PW] Contract execution challenge error:", error);
    return NextResponse.json({ error: "Could not prepare the Circle transaction." }, { status: 500 });
  }
}
