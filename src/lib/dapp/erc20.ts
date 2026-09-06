/**
 * Read-only ERC-20 helpers for the AGFusion dApp, using the same-origin Arc RPC
 * proxy (/api/rpc?chain=arc) so the app never leaks a wallet's private RPC.
 */
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  maxUint256,
  type Address,
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";

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

/** Same-origin Arc RPC (browser) or the raw RPC (server). */
export function arcRpcUrl(): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc?chain=arc`
    : arcTestnet.rpcUrls.default.http[0];
}

export function arcPublicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(arcRpcUrl()) });
}

export async function readErc20BalanceRaw(
  token: Address,
  owner: Address,
): Promise<bigint> {
  const client = arcPublicClient();
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
): Promise<string> {
  try {
    const raw = await readErc20BalanceRaw(token, owner);
    return formatUnits(raw, decimals);
  } catch {
    return "0";
  }
}

export async function readAllowance(
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  try {
    const client = arcPublicClient();
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
