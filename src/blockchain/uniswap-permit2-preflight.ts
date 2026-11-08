import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  type Address,
} from "viem";
import { ARC_PERMIT2_CONTRACT, ARC_PERMIT2_SPENDER } from "@/blockchain/uniswap-permit2";

export const ARC_MAINNET_GAS_RESERVE = 15_000_000_000_000_000n; // 0.015 native USDC
const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_MAINNET_RPC = "https://rpc.mainnet.arc.io";

export const ARC_MAINNET_SWAP_TOKENS = {
  USDC: "0x3600000000000000000000000000000000000000",
  EURC: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  cirBTC: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
} as const;

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const PERMIT2_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET_RPC] } },
});

const publicClient = createPublicClient({ chain: arcMainnet, transport: http(ARC_MAINNET_RPC) });

function fail(message: string): never {
  throw new Error("Arc Mainnet Permit2 preflight rejected: " + message);
}

function normalizeAddress(value: string, label: string): Address {
  if (!isAddress(value)) fail("invalid " + label);
  return value as Address;
}

function assertAllowedToken(value: string): Address {
  const token = normalizeAddress(value, "token address");
  const allowed = Object.values(ARC_MAINNET_SWAP_TOKENS).some((address) => address.toLowerCase() === token.toLowerCase());
  if (!allowed) fail("token is not in the Arc Mainnet allowlist");
  return token;
}

function assertAmount(amount: bigint): void {
  if (amount <= 0n || amount >= (1n << 160n)) fail("amount must be a positive uint160");
}

/**
 * Builds only the unsigned ERC-20 approval calldata. The allowance is exact,
 * scoped to the canonical Permit2 contract, and never set to uint256 max.
 */
export function buildExactPermit2Approval(accountInput: string, tokenInput: string, amount: bigint) {
  const account = normalizeAddress(accountInput, "wallet account");
  const token = assertAllowedToken(tokenInput);
  assertAmount(amount);
  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    from: account,
    to: token,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ARC_PERMIT2_CONTRACT, amount],
    }),
    value: "0" as const,
    spender: ARC_PERMIT2_CONTRACT,
    amount,
  };
}

export type ArcMainnetPermit2Preflight = {
  chainId: 5042;
  account: Address;
  token: Address;
  amount: bigint;
  tokenBalance: bigint;
  nativeGasBalance: bigint;
  erc20AllowanceToPermit2: bigint;
  permit2AllowanceToRouter: bigint;
  permit2Expiration: number;
  permit2Nonce: number;
  hasTokenBalance: boolean;
  hasGasReserve: boolean;
  requiresErc20Approval: boolean;
  requiresPermit2Signature: boolean;
  readyForSwapAfterPermit: boolean;
};

/** Read-only RPC checks. This function never prompts a wallet or writes to chain. */
export async function readArcMainnetPermit2Preflight(params: {
  account: string;
  token: string;
  amount: bigint;
  nowSeconds?: number;
}): Promise<ArcMainnetPermit2Preflight> {
  const account = normalizeAddress(params.account, "wallet account");
  const token = assertAllowedToken(params.token);
  assertAmount(params.amount);
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) fail("invalid local clock");

  const [tokenBalance, nativeGasBalance, erc20Allowance, permit2Allowance] = await Promise.all([
    publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] }),
    publicClient.getBalance({ address: account }),
    publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [account, ARC_PERMIT2_CONTRACT as Address] }),
    publicClient.readContract({
      address: ARC_PERMIT2_CONTRACT as Address,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [account, token, ARC_PERMIT2_SPENDER as Address],
    }),
  ]);

  const [permit2AllowanceToRouter, permit2Expiration, permit2Nonce] = permit2Allowance;
  const hasTokenBalance = tokenBalance >= params.amount;
  const hasGasReserve = nativeGasBalance >= ARC_MAINNET_GAS_RESERVE;
  const requiresErc20Approval = erc20Allowance < params.amount;
  const requiresPermit2Signature = permit2AllowanceToRouter < params.amount || BigInt(permit2Expiration) <= BigInt(now);

  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    account,
    token,
    amount: params.amount,
    tokenBalance,
    nativeGasBalance,
    erc20AllowanceToPermit2: erc20Allowance,
    permit2AllowanceToRouter,
    permit2Expiration,
    permit2Nonce,
    hasTokenBalance,
    hasGasReserve,
    requiresErc20Approval,
    requiresPermit2Signature,
    readyForSwapAfterPermit: hasTokenBalance && hasGasReserve && !requiresErc20Approval,
  };
}
