import { defineChain } from "viem";

/**
 * Official Arc Testnet network (MetaMask / wallet_addEthereumChain).
 *
 * | Field            | Value                              |
 * |------------------|------------------------------------|
 * | Network name     | Arc Testnet                        |
 * | New RPC URL      | https://rpc.testnet.arc.io         |
 * | Chain ID         | 5042002  (hex 0x4cef52)            |
 * | Currency symbol  | USDC                               |
 * | Explorer URL     | https://testnet.arcscan.app        |
 *
 * IMPORTANT: hex must be 0x4cef52 NOT 0x4cf152 (typo that breaks MetaMask).
 */

export const ARC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
  "https://rpc.testnet.arc.io";

export const ARC_TESTNET_WS =
  process.env.NEXT_PUBLIC_ARC_WS_URL?.trim() ||
  "wss://rpc.testnet.arc.io";

export const ARC_CHAIN_ID = 5042002;
/** Live RPC eth_chainId from rpc.testnet.arc.network */
export const ARC_CHAIN_ID_HEX = "0x4cef52";
export const ARC_NETWORK_NAME = "Arc Testnet";
export const ARC_CURRENCY_SYMBOL = "USDC";
export const ARC_CURRENCY_NAME = "USDC";
export const ARC_CURRENCY_DECIMALS = 18;
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_FAUCET_URL = "https://faucet.circle.com";
export const ARC_DOCS_URL = "https://docs.arc.io";
export const ARC_APPKIT_URL = "https://docs.arc.io/app-kit";

/** MetaMask / EIP-3085 wallet_addEthereumChain params */
export const ARC_TESTNET_WALLET_PARAMS = {
  chainId: "0x4cef52",
  chainName: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.testnet.arc.io"] as string[],
  blockExplorerUrls: ["https://testnet.arcscan.app"] as string[],
};

/** Query RPC for eth_chainId so wallet_add always matches MetaMask checks. */
export async function fetchArcChainIdFromRpc(
  rpcUrl: string = ARC_TESTNET_RPC,
): Promise<{ hex: string; decimal: number }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!res.ok) {
    throw new Error(`Arc RPC unreachable (${res.status}): ${rpcUrl}`);
  }
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error?.message) {
    throw new Error(`Arc RPC error: ${data.error.message}`);
  }
  const hex = (data.result || "").toLowerCase();
  if (!hex.startsWith("0x")) {
    throw new Error(`Invalid eth_chainId from RPC: ${data.result}`);
  }
  const decimal = parseInt(hex, 16);
  return { hex, decimal };
}

/** Build wallet_addEthereumChain params using live RPC chainId. */
export async function getArcWalletAddParams(): Promise<{
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}> {
  const rpc = ARC_TESTNET_RPC;
  let chainId = ARC_CHAIN_ID_HEX.toLowerCase();
  try {
    const live = await fetchArcChainIdFromRpc(rpc);
    chainId = live.hex;
    if (live.decimal !== ARC_CHAIN_ID) {
      console.warn(
        `[AGFusion] RPC chainId decimal ${live.decimal} != expected ${ARC_CHAIN_ID}`,
      );
    }
  } catch (e) {
    console.warn("[AGFusion] using static chainId hex; RPC probe failed", e);
  }

  return {
    chainId,
    chainName: ARC_NETWORK_NAME,
    nativeCurrency: {
      name: ARC_CURRENCY_NAME,
      symbol: ARC_CURRENCY_SYMBOL,
      decimals: ARC_CURRENCY_DECIMALS,
    },
    rpcUrls: [rpc],
    blockExplorerUrls: [ARC_EXPLORER],
  };
}

/** viem chain definition */
export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: ARC_NETWORK_NAME,
  nativeCurrency: {
    name: ARC_CURRENCY_NAME,
    symbol: ARC_CURRENCY_SYMBOL,
    decimals: ARC_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC],
      webSocket: [ARC_TESTNET_WS],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: ARC_EXPLORER,
    },
  },
  testnet: true,
});

export function explorerTxUrl(txHash: string, chain: "arc" | "base" = "arc") {
  if (chain === "base") {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  return `${ARC_EXPLORER}/tx/${txHash}`;
}

export function isArcChainId(id: number | null | undefined): boolean {
  return id === ARC_CHAIN_ID;
}

export const ARC_NETWORK_MANUAL = {
  networkName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  chainId: "5042002",
  chainIdHex: "0x4cef52",
  currencySymbol: "USDC",
  explorerUrl: "https://testnet.arcscan.app",
} as const;
