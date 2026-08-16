import { z } from "zod";
import { maxTransferAmount } from "@/lib/config";
import { isAddress } from "viem";

// Every CCTP v2 testnet chain the app can bridge (see @/lib/cctp-chains).
// Polygon_Amoy is accepted as an alias for Polygon_Amoy_Testnet.
const chainIdSchema = z.enum([
  "Arc_Testnet",
  "Ethereum_Sepolia",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Optimism_Sepolia",
  "Polygon_Amoy",
  "Polygon_Amoy_Testnet",
  "Avalanche_Fuji",
  "Unichain_Sepolia",
  "Linea_Sepolia",
  "Solana_Devnet",
]);

export const walletContextSchema = z.object({
  address: z
    .string()
    .refine((val) => isAddress(val, { strict: false }), "Invalid EVM address")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  chainId: z.number().int().nullable().optional(),
  liveBalanceUsdc: z.string().nullable().optional(),
  forceDemo: z.boolean().optional(),
});

export const agentRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  execute: z.boolean().optional().default(false),
  /** Must be true when execute=true — proves UI confirm gate */
  confirmed: z.boolean().optional().default(false),
  stream: z.boolean().optional().default(true),
  wallet: walletContextSchema.optional().default({}),
  confirmToken: z.string().max(200).optional(),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .refine((v) => {
    const n = Number(v);
    return n > 0 && n <= maxTransferAmount();
  }, `Amount must be between 0 and ${maxTransferAmount()}`);

export const bridgeBodySchema = z.object({
  amount: amountSchema,
  fromChain: chainIdSchema,
  toChain: chainIdSchema,
  token: z.string().default("USDC"),
  preferLive: z.boolean().optional(),
});

export const sendBodySchema = z.object({
  amount: amountSchema,
  token: z.string().default("USDC"),
  chain: chainIdSchema.default("Arc_Testnet"),
  recipient: z.string().refine((val) => isAddress(val, { strict: false }), "Invalid recipient address checksum"),
  recipientLabel: z.string().max(64).optional(),
  preferLive: z.boolean().optional(),
});

export const swapBodySchema = z.object({
  amount: amountSchema,
  tokenIn: z.string().default("USDC"),
  tokenOut: z.string().default("EURC"),
  chain: chainIdSchema.default("Arc_Testnet"),
});

export const siweVerifySchema = z.object({
  message: z.string().min(10).max(4000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

export const persistTxSchema = z.object({
  clientId: z.string().max(80).optional(),
  type: z.enum(["bridge", "swap", "send", "unified_spend", "deploy"]),
  status: z.string(),
  amount: z.string(),
  token: z.string(),
  tokenOut: z.string().optional(),
  fromChain: z.string().optional(),
  toChain: z.string().optional(),
  recipient: z.string().optional(),
  recipientLabel: z.string().optional(),
  feeUsd: z.number().optional(),
  txHash: z.string().optional(),
  explorerUrl: z.string().optional(),
  executionMode: z.enum(["demo", "live"]).optional(),
  message: z.string().optional(),
  stepsJson: z.string().optional(),
});
