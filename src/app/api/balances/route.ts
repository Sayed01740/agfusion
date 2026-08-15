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
    const cleanAddress = address.toLowerCase().replace(/^0x/, "");
    const balanceOfData = `0x70a08231${"0".repeat(24)}${cleanAddress}`;

    const [gasRes, tokenRes] = await Promise.all([
      fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
        signal: AbortSignal.timeout?.(10_000),
      }),
      fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "eth_call",
          params: [
            {
              to: "0x3600000000000000000000000000000000000000",
              data: balanceOfData,
            },
            "latest",
          ],
        }),
        signal: AbortSignal.timeout?.(10_000),
      }),
    ]);

    let gasAmount = "0";
    let gasUsd = 0;
    if (gasRes.ok) {
      const data = (await gasRes.json()) as {
        result?: string;
        error?: { message?: string };
      };
      if (data.result && !data.error) {
        const weiHex = data.result;
        const wei = BigInt(weiHex);
        const whole = Number(wei) / 1e18;
        gasAmount = Number.isFinite(whole)
          ? whole.toLocaleString("en-US", {
              maximumFractionDigits: 6,
              useGrouping: false,
            })
          : "0";
        gasUsd = Number.isFinite(whole) ? whole : 0;
      }
    }

    let tokenBalance = 0;
    if (tokenRes.ok) {
      const data = (await tokenRes.json()) as {
        result?: string;
        error?: { message?: string };
      };
      if (data.result && !data.error) {
        const valHex = data.result === "0x" ? "0x0" : data.result;
        const val = BigInt(valHex);
        tokenBalance = Number(val) / 1e6; // ERC-20 USDC uses 6 decimals
      }
    }

    const tokenAmountStr = Number.isFinite(tokenBalance)
      ? tokenBalance.toLocaleString("en-US", {
          maximumFractionDigits: 6,
          useGrouping: false,
        })
      : "0";

    return NextResponse.json({
      totalUsd: tokenBalance,
      address,
      balances: [
        {
          chain: "Arc_Testnet",
          chainName: "Arc Testnet",
          token: "USDC",
          amount: tokenAmountStr,
          usdValue: tokenBalance,
          source: "rpc",
        },
        {
          chain: "Arc_Testnet",
          chainName: "Arc Testnet",
          token: "USDC (Gas)",
          amount: gasAmount,
          usdValue: gasUsd,
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
