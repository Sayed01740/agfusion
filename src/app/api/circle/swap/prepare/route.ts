import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerKitKey } from "@/lib/circle-kit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Both Arc Mainnet (5042) and Arc Testnet (5042002) are supported
const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_TESTNET_CHAIN_ID = 5042002;

// Detect whether we're configured for mainnet
const IS_MAINNET =
  process.env.NEXT_PUBLIC_ARC_NETWORK === "mainnet" ||
  process.env.NEXT_PUBLIC_ARC_CHAIN_ID === "5042" ||
  process.env.NEXT_PUBLIC_ARC_CHAIN_HEX?.toLowerCase() === "0x13b2";

/** Default chain ID follows the runtime Arc network config */
const ARC_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID;
const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: "0x3600000000000000000000000000000000000000",
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};
const SUPPORTED_TOKENS = ["USDC", "EURC"] as const;
type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item);
    return out;
  }
  return value;
}

function collectTransactions(
  value: unknown,
  out: Array<{ to: string; data: string; value?: string }> = [],
) {
  if (Array.isArray(value)) {
    for (const item of value) collectTransactions(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  const obj = value as Record<string, unknown>;
  const to =
    typeof obj.to === "string"
      ? obj.to
      : typeof obj.contractAddress === "string"
        ? obj.contractAddress
        : undefined;
  const data =
    typeof obj.data === "string"
      ? obj.data
      : typeof obj.callData === "string"
        ? obj.callData
        : undefined;
  if (
    to &&
    data &&
    /^0x[0-9a-fA-F]{40}$/.test(to) &&
    /^0x[0-9a-fA-F]*$/.test(data)
  ) {
    const valueField =
      typeof obj.value === "string"
        ? obj.value
        : typeof obj.amount === "string"
          ? obj.amount
          : undefined;
    const key = `${to.toLowerCase()}:${data.toLowerCase()}:${valueField || "0"}`;
    if (
      !out.some(
        (tx) =>
          `${tx.to.toLowerCase()}:${tx.data.toLowerCase()}:${tx.value || "0"}` === key,
      )
    ) {
      out.push({ to, data, ...(valueField ? { value: valueField } : {}) });
    }
  }
  for (const child of Object.values(obj)) collectTransactions(child, out);
  return out;
}

export async function POST(req: Request) {
  const rl = rateLimit(`circle-swap-prepare:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: {
    address?: unknown;
    amount?: unknown;
    tokenIn?: unknown;
    tokenOut?: unknown;
    chainId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const address = String(body.address || "").trim();
  const amount = String(body.amount || "").trim();
  const tokenIn = String(body.tokenIn || "").toUpperCase() as SupportedToken;
  const tokenOut = String(body.tokenOut || "").toUpperCase() as SupportedToken;
  const chainId = Number(body.chainId ?? ARC_CHAIN_ID);

  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
  }
  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (
    !TOKEN_ADDRESSES[tokenIn] ||
    !TOKEN_ADDRESSES[tokenOut] ||
    tokenIn === tokenOut
  ) {
    return NextResponse.json({ error: "unsupported_swap_pair" }, { status: 400 });
  }
  if (chainId !== ARC_MAINNET_CHAIN_ID && chainId !== ARC_TESTNET_CHAIN_ID) {
    return NextResponse.json(
      { error: "unsupported_swap_chain", detail: `Chain ${chainId} is not Arc Mainnet (5042) or Arc Testnet (5042002).` },
      { status: 400 },
    );
  }

  const kitKey = getServerKitKey();
  if (!kitKey) {
    console.error("[AGFusion] Circle App Kit key is missing from server environment.");
    return NextResponse.json(
      { error: "Circle App Kit is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    // AGFusion already installs @circle-fin/app-kit and its Viem adapter.
    // Use the official App Kit swap API instead of the lower-level
    // StablecoinServiceSwapProvider. Arc Testnet is an official supported
    // testnet in the repository's Circle swap skill.
    const [{ AppKit }, { createViemAdapterFromProvider }, viem] = await Promise.all([
      import("@circle-fin/app-kit"),
      import("@circle-fin/adapter-viem-v2"),
      import("viem"),
    ]);

    // Determine which Arc chain we are on for this request
    const requestIsMainnet = chainId === ARC_MAINNET_CHAIN_ID;
    const arcViemChainId = requestIsMainnet ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID;
    const arcViemName = requestIsMainnet ? "Arc Mainnet" : "Arc Testnet";
    const arcViemRpc = requestIsMainnet
      ? (process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.mainnet.arc.io")
      : (process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io");
    const arcViemExplorer = requestIsMainnet
      ? "https://explorer.arc.io"
      : "https://testnet.arcscan.app";
    const arcChainHex = requestIsMainnet ? "0x13b2" : "0x4cef52";

    const arcViem = viem.defineChain({
      id: arcViemChainId,
      name: arcViemName,
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: {
        default: { http: [arcViemRpc] },
      },
      blockExplorers: {
        default: { name: "Arc Explorer", url: arcViemExplorer },
      },
      testnet: !requestIsMainnet,
    });

    const publicClient = viem.createPublicClient({
      chain: arcViem,
      transport: viem.http(),
    });

    const provider = {
      request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
        if (method === "eth_accounts") return [address];
        if (method === "eth_chainId") return arcChainHex;
        return publicClient.request({ method: method as never, params: params as never });
      },
    } as unknown as Parameters<typeof createViemAdapterFromProvider>[0]["provider"];

    const adapter = await createViemAdapterFromProvider({ provider });

    // Circle App Kit chain identifier: "Arc" for mainnet, "Arc_Testnet" for testnet
    // Cast via unknown to bridge the SwapChainIdentifier type which may not yet include "Arc"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appKitChainName = (requestIsMainnet ? "Arc" : "Arc_Testnet") as any;

    const kit = new AppKit();
    const estimate = await kit.estimateSwap({
      from: {
        adapter,
        chain: appKitChainName,
      },
      tokenIn: tokenIn as SupportedToken,
      tokenOut: tokenOut as SupportedToken,
      amountIn: amount,
      config: {
        kitKey,
        slippageBps: 100,
        allowanceStrategy: "approve",
      },
    });

    const transactions = collectTransactions(estimate);
    if (!transactions.length) {
      return NextResponse.json(
        {
          error: "Circle App Kit returned a quote without executable transaction data.",
          estimate: jsonSafe(estimate),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        chainId: ARC_CHAIN_ID,
        address,
        tokenIn,
        tokenOut,
        amountIn: amount,
        estimate: jsonSafe(estimate),
        transactions: jsonSafe(transactions),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AGFusion] Circle App Kit swap preparation failed", error);
    return NextResponse.json(
      { error: message || "Circle App Kit could not prepare this swap." },
      { status: 502 },
    );
  }
}
