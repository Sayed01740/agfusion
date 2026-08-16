import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const { userToken, blockchains } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "User Token is required" }, { status: 400 });
    }

    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "CIRCLE_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Call Circle API to create a wallet challenge
    const idempotencyKey = randomUUID();
    let response = await fetch("https://api.circle.com/v1/w3s/user/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey,
        // Both networks are required for the app's Arc ↔ Base testnet bridge.
        // Circle uses the correct wallet instance when a transaction is made
        // on either source chain.
        blockchains:
          Array.isArray(blockchains) && blockchains.length
            ? blockchains
            : ["ARC-TESTNET", "BASE-SEPOLIA"],
        accountType: "SCA",
      }),
    });

    let data = await response.json();

    // If the user hasn't set up a PIN, create a PIN setup challenge instead
    if (!response.ok && data?.message?.includes("User has not set up a PIN yet")) {
      console.log("[Circle PW] User needs a PIN. Creating PIN setup challenge...");
      response = await fetch("https://api.circle.com/v1/w3s/user/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-User-Token": userToken,
        },
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      });
      data = await response.json();
    }

    if (!response.ok) {
      console.error("[Circle PW] Wallet/PIN Creation Error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to create Circle challenge" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      challengeId: data.data.challengeId,
    });
  } catch (error) {
    console.error("[Circle PW] Challenge API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
