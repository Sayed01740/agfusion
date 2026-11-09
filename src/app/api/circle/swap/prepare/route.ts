import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerKitKey } from "@/lib/circle-kit-server";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mainnet is recognized for validation but remains unavailable until an authorized settlement integration exists.
const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_CHAIN_ID = ARC_TESTNET_CHAIN_ID;
// The API accepts token symbols; Circle App Kit resolves chain-specific token
// metadata. Keep this list as an allowlist, not as a shared address map.
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


export async function POST(req: Request) {
  const rl = rateLimit(`circle-swap-prepare:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const bodyResult = await readLimitedJson(req, 8 * 1024);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }
  const raw = bodyResult.value;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const body = raw as {
    address?: unknown;
    amount?: unknown;
    tokenIn?: unknown;
    tokenOut?: unknown;
    chainId?: unknown;
  };

  const address = String(body.address || "").trim();
  const amount = String(body.amount || "").trim();
  const tokenIn = String(body.tokenIn || "").toUpperCase() as SupportedToken;
  const tokenOut = String(body.tokenOut || "").toUpperCase() as SupportedToken;
  const chainId = Number(body.chainId ?? ARC_CHAIN_ID);

  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
  }
  // USDC and EURC are 6-decimal ERC-20s on Arc. Reject non-decimal,
  // exponent, overlong, and over-precision inputs before initializing Circle SDK.
  const amountParts = amount.split(".");
  const validDecimalAmount =
    amount.length <= 80 &&
    /^\d+(?:\.\d+)?$/.test(amount) &&
    amountParts.length <= 2 &&
    (amountParts[1]?.length ?? 0) <= 6;

  if (
    !validDecimalAmount ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0
  ) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (
    !SUPPORTED_TOKENS.includes(tokenIn) ||
    !SUPPORTED_TOKENS.includes(tokenOut) ||
    tokenIn === tokenOut
  ) {
    return NextResponse.json({ error: "unsupported_swap_pair" }, { status: 400 });
  }
  const isMainnet = chainId === ARC_MAINNET_CHAIN_ID;
  if (chainId !== ARC_TESTNET_CHAIN_ID && !isMainnet) {
    return NextResponse.json(
      { error: "unsupported_swap_chain", detail: "Only Arc Mainnet (5042) and Arc Testnet (5042002) are supported." },
      { status: 400 },
    );
  }
  if (isMainnet && process.env.ARC_MAINNET_SWAP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "mainnet_swap_disabled", detail: "Arc Mainnet swap preparation is disabled until the Mainnet release gate is enabled." },
      { status: 403 },
    );
  }

  // The current UI uses a separate browser-wallet execution path. Circle StableFX
  // is permissioned and its App Kit estimate is quote-only, not unsigned calldata.
  // Keep this API fail-closed even if the legacy feature flag is accidentally set.
  if (isMainnet) {
    return NextResponse.json(
      {
        error: "mainnet_swap_not_ready",
        detail: "Arc Mainnet requires an authorized StableFX or independently verified DEX execution integration. No quote or transaction was created.",
      },
      { status: 503 },
    );
  }

  // Circle's estimateSwap Testnet path supports permissionless quotes.
  // When a server Kit Key is configured, pass it through; otherwise omit it.
  const kitKey = getServerKitKey();

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

    // This quote-only App Kit path is Testnet-only. Mainnet is rejected above.
    const arcViem = viem.defineChain({
      id: ARC_TESTNET_CHAIN_ID,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: {
        default: {
          http: [process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io"],
        },
      },
      blockExplorers: {
        default: { name: "Arc Explorer", url: "https://testnet.arcscan.app" },
      },
      testnet: true,
    });

    const publicClient = viem.createPublicClient({
      chain: arcViem,
      transport: viem.http(),
    });

    const provider = {
      request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
        if (method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x4cef52";
        return publicClient.request({ method: method as never, params: params as never });
      },
    } as unknown as Parameters<typeof createViemAdapterFromProvider>[0]["provider"];

    const adapter = await createViemAdapterFromProvider({ provider });

    // Circle App Kit uses the string identifiers "Arc" and "Arc_Testnet".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appKitChainName = "Arc_Testnet" as any;

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
        ...(kitKey ? { kitKey } : {}),
        slippageBps: 100,
        allowanceStrategy: "approve",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        chainId,
        network: "testnet",
        address,
        tokenIn,
        tokenOut,
        amountIn: amount,
        estimate: jsonSafe(estimate),
        
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
