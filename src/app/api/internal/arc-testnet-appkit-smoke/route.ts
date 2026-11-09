import { NextResponse } from "next/server";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { defineChain, createPublicClient, http } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY: Preview-only, read-only Arc Testnet estimate smoke. No signing or swap execution.
const ARC_TESTNET_CHAIN_ID = 5042002;
const TEST_WALLET = "0x1111111111111111111111111111111111111111";

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

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const chain = defineChain({
    id: ARC_TESTNET_CHAIN_ID,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
    blockExplorers: { default: { name: "Arcscan Testnet", url: "https://testnet.arcscan.app" } },
    testnet: true,
  });

  try {
    const publicClient = createPublicClient({ chain, transport: http("https://rpc.testnet.arc.io") });
    const provider = {
      request: async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
        if (method === "eth_accounts") return [TEST_WALLET];
        if (method === "eth_chainId") return "0x4cef52";
        return publicClient.request({ method: method as never, params: params as never });
      },
    } as unknown as Parameters<typeof createViemAdapterFromProvider>[0]["provider"];

    const adapter = await createViemAdapterFromProvider({ provider });
    const kit = new AppKit();
    const estimate = await kit.estimateSwap({
      from: { adapter, chain: "Arc_Testnet" as never },
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "0.01",
      config: { slippageBps: 100, allowanceStrategy: "approve" },
    });

    return NextResponse.json({
      ok: true,
      chainId: ARC_TESTNET_CHAIN_ID,
      network: "testnet",
      address: TEST_WALLET,
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "0.01",
      kitKeyProvided: false,
      operation: "estimateSwap",
      estimate: jsonSafe(estimate),
      safety: { walletSigning: false, approval: false, transactionSubmission: false },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      chainId: ARC_TESTNET_CHAIN_ID,
      network: "testnet",
      operation: "estimateSwap",
      kitKeyProvided: false,
      error: error instanceof Error ? error.message : "Unknown App Kit estimate error",
      safety: { walletSigning: false, approval: false, transactionSubmission: false },
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
