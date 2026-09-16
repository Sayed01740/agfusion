/**
 * Read-only ERC-20 helpers for the AGFusion dApp, using the same-origin Arc RPC
 * proxy (/api/rpc?chain=arc) so the app never leaks a wallet's private RPC.
 *
 * arcPublicClient() and arcRpcUrl() are now network-aware: they use IS_ARC_MAINNET
 * (env-based default) but can be overridden per-call with an isMainnet flag.
 */
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  maxUint256,
  type Address,
  type Chain,
} from "viem";
import { arcChain, arcMainnetChain, arcTestnetChain, IS_ARC_MAINNET } from "@/lib/arc-chain";

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Same-origin Arc RPC proxy (browser) or the raw RPC (server).
 * Pass isMainnet to override the IS_ARC_MAINNET default.
 */
export function arcRpcUrl(isMainnet?: boolean): string {
  if (typeof window !== "undefined") {
    // The proxy handles both mainnet and testnet via the ?chain=arc key
    return `${window.location.origin}/api/rpc?chain=arc`;
  }
  // Server side: use the real RPC based on detected or configured network
  const mainnet = isMainnet ?? IS_ARC_MAINNET;
  return mainnet
    ? (process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io")
    : "https://rpc.testnet.arc.io";
}

/**
 * Network-aware public client. Uses the IS_ARC_MAINNET default or a
 * caller-supplied chain override. Pass the viem Chain object or a boolean.
 */
export function arcPublicClient(chainOverride?: Chain | boolean): ReturnType<typeof createPublicClient> {
  let chain: Chain;
  if (chainOverride && typeof chainOverride === "object") {
    chain = chainOverride;
  } else if (typeof chainOverride === "boolean") {
    chain = chainOverride ? arcMainnetChain : arcTestnetChain;
  } else {
    chain = arcChain; // resolved from IS_ARC_MAINNET at build time
  }
  const rpc = arcRpcUrl(chain.id === 5042 ? true : chain.id === 5042002 ? false : undefined);
  return createPublicClient({ chain, transport: http(rpc) });
}

export async function readErc20BalanceRaw(
  token: Address,
  owner: Address,
  isMainnet?: boolean,
): Promise<bigint> {
  const client = arcPublicClient(isMainnet);
  return (await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export async function readErc20Balance(
  token: Address,
  owner: Address,
  decimals: number,
  isMainnet?: boolean,
): Promise<string> {
  try {
    const raw = await readErc20BalanceRaw(token, owner, isMainnet);
    return formatUnits(raw, decimals);
  } catch {
    return "0";
  }
}

export async function readAllowance(
  token: Address,
  owner: Address,
  spender: Address,
  isMainnet?: boolean,
): Promise<bigint> {
  try {
    const client = arcPublicClient(isMainnet);
    return (await client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  } catch {
    return 0n;
  }
}

export function encodeApprove(spender: Address, amount: bigint = maxUint256): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
}

export { maxUint256 };
