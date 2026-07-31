import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ARC_TESTNET_RPC } from "@/lib/arc-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live Arc USDC (native gas) balance via public RPC.
 * Accepts ?address=0x… or authenticated session address.
 */
export async function GET(req: Request) {
  const rl = rateLimit(`balances:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 40,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const qAddr = url.searchParams.get("address")?.trim() || "";
  const session = await getSessionUser();
  const address =
    (qAddr.match(/^0x[a-fA-F0-9]{40}$/) ? qAddr : null) ||
    session?.address ||
    null;

  if (!address) {
    return NextResponse.json({
      totalUsd: 0,
      balances: [],
      updatedAt: new Date().toISOString(),
      note: "Connect a wallet or pass ?address=0x… for live Arc USDC",
    });
  }

  try {
    const rpc = process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || ARC_TESTNET_RPC;
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
      // short timeout for serverless
      signal: AbortSignal.timeout?.(12_000),
    });

    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      result?: string;
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(data.error.message);

    const weiHex = data.result || "0x0";
    const wei = BigInt(weiHex);
    // Arc USDC native uses 18 decimals
    const whole = Number(wei) / 1e18;
    const amount = Number.isFinite(whole)
      ? whole.toLocaleString("en-US", {
          maximumFractionDigits: 6,
          useGrouping: false,
        })
      : "0";
    const usd = Number.isFinite(whole) ? whole : 0;

    return NextResponse.json({
      totalUsd: usd,
      address,
      balances: [
        {
          chain: "Arc_Testnet",
          chainName: "Arc Testnet",
          token: "USDC",
          amount,
          usdValue: usd,
          source: "rpc",
        },
      ],
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[balances] rpc failed", e);
    return NextResponse.json({
      totalUsd: 0,
      address,
      balances: [],
      updatedAt: new Date().toISOString(),
      note: "Could not read Arc RPC. Check network or try again.",
    });
  }
}
