import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userToken } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "User Token is required" }, { status: 400 });
    }

    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "CIRCLE_API_KEY is not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.circle.com/v1/w3s/wallets", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-User-Token": userToken,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Failed to fetch wallets" },
        { status: response.status }
      );
    }

    const wallets = data.data?.wallets || [];
    if (wallets.length === 0) {
      return NextResponse.json({ address: null });
    }

    // A Circle user can own a wallet per blockchain. Return the full list so
    // the browser can use the correct source-chain wallet for a bridge.
    return NextResponse.json({
      wallets: wallets.map((wallet: { id?: string; address?: string; blockchain?: string; accountType?: string }) => ({
        id: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        accountType: wallet.accountType,
      })),
      address: wallets.find((wallet: { blockchain?: string }) => wallet.blockchain === "ARC-TESTNET")?.address ?? wallets[0].address,
    });
  } catch (error) {
    console.error("[Circle PW] Fetch Wallets Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
