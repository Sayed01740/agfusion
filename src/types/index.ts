export type ChainId =
  | "Arbitrum"
  | "Avalanche"
  | "Base"
  | "Codex"
  | "Cronos"
  | "Edge"
  | "Ethereum"
  | "HyperEVM"
  | "Injective"
  | "Ink"
  | "Linea"
  | "Monad"
  | "Morph"
  | "Optimism"
  | "Pharos"
  | "Plume"
  | "Polygon"
  | "Sei"
  | "Sonic"
  | "Unichain"
  | "World_Chain"
  | "XDC"
  | "Arc_Testnet"
  | "Arbitrum_Sepolia"
  | "Avalanche_Fuji"
  | "Base_Sepolia"
  | "Codex_Testnet"
  | "Cronos_Testnet"
  | "Edge_Testnet"
  | "Ethereum_Sepolia"
  | "HyperEVM_Testnet"
  | "Injective_Testnet"
  | "Ink_Testnet"
  | "Linea_Sepolia"
  | "Monad_Testnet"
  | "Morph_Testnet"
  | "Optimism_Sepolia"
  | "Pharos_Testnet"
  | "Plume_Testnet"
  | "Polygon_Amoy_Testnet"
  | "Sei_Testnet"
  | "Solana_Devnet"
  | "Sonic_Testnet"
  | "Unichain_Sepolia"
  | "World_Chain_Sepolia"
  | "XDC_Apothem";

export type StableToken = "USDC" | "EURC" | "USDT" | "USDe" | "DAI" | "PYUSD";

export type IntentType =
  | "bridge"
  | "swap"
  | "send"
  | "balance"
  | "code"
  | "deploy"
  | "route"
  | "explain"
  | "agent"
  | "unknown";

export interface ChainBalance {
  chain: ChainId;
  chainLabel: string;
  token: StableToken;
  amount: number;
  usdValue: number;
  color: string;
}

export interface UnifiedBalanceSnapshot {
  totalUsd: number;
  balances: ChainBalance[];
  updatedAt: string;
}

export type TxStatus =
  | "pending"
  | "approving"
  | "burning"
  | "attesting"
  | "minting"
  | "swapping"
  | "sending"
  | "success"
  | "error"
  | "retryable";

export type ExecutionMode = "demo" | "live";

export interface TransactionRecord {
  id: string;
  type: "bridge" | "swap" | "send" | "unified_spend" | "deploy";
  status: TxStatus;
  amount: string;
  token: string;
  tokenOut?: string;
  fromChain?: ChainId;
  toChain?: ChainId;
  recipient?: string;
  recipientLabel?: string;
  feeUsd?: number;
  steps: TxStep[];
  txHash?: string;
  explorerUrl?: string;
  createdAt: string;
  message?: string;
  executionMode?: ExecutionMode;
  retryable?: boolean;
  bridgeResult?: unknown;
  bridgeState?: {
    txId: string;
    walletType: "evm" | "circle" | "agent";
    walletAddress?: string | null;
    fromChain: ChainId;
    toChain: ChainId;
    token: string;
    amount: string;
    recipient?: string;
    approvalTxHash?: string;
    burnTxHash?: string;
    attestationData?: unknown;
    destinationTxHash?: string;
    state:
      | "INIT"
      | "APPROVAL_PENDING"
      | "APPROVED"
      | "BURN_PENDING"
      | "BURN_CONFIRMED"
      | "ATTESTATION_PENDING"
      | "ATTESTATION_RECEIVED"
      | "DESTINATION_PENDING"
      | "DESTINATION_CONFIRMED"
      | "COMPLETED"
      | "FAILED"
      | "RECOVERABLE";
    error?: string;
    createdAt: number;
    updatedAt: number;
  };
}

export interface TxStep {
  name: string;
  state: "pending" | "active" | "success" | "error" | "noop";
  txHash?: string;
  message?: string;
}

export interface AgentToolTrace {
  name: string;
  summary: string;
  ok: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  intent?: IntentType;
  actionPreview?: ActionPreview;
  transactionId?: string;
  codeBlocks?: CodeBlock[];
  isStreaming?: boolean;
  agentStatus?: string;
  toolTrace?: AgentToolTrace[];
}

export interface ActionPlanStep {
  id: string;
  label: string;
  detail?: string;
}

export interface ActionPreview {
  type: IntentType;
  title: string;
  summary: string;
  amount?: string;
  token?: string;
  tokenOut?: string;
  fromChain?: ChainId;
  toChain?: ChainId;
  recipient?: string;
  recipientLabel?: string;
  estimatedFeeUsd?: number;
  estimatedTime?: string;
  route?: string[];
  plan?: ActionPlanStep[];
  canExecute: boolean;
  executed?: boolean;
  requiresWallet?: boolean;
  /** Wallet-bound, short-lived capability issued by the server after planning. */
  confirmToken?: string;
}

export interface CodeBlock {
  language: string;
  filename?: string;
  code: string;
}

export interface ParsedIntent {
  type: IntentType;
  confidence: number;
  amount?: string;
  token?: StableToken;
  tokenOut?: StableToken;
  fromChain?: ChainId;
  toChain?: ChainId;
  recipient?: string;
  recipientLabel?: string;
  codeTopic?: string;
  raw: string;
}

export interface BridgeEstimate {
  amount: string;
  feeUsd: number;
  gasUsd: number;
  eta: string;
  route: string;
  speed: "fast" | "standard";
  estimated?: boolean;
  note?: string;
}

export interface SwapEstimate {
  amountIn: string;
  amountOut: string;
  tokenIn: string;
  tokenOut: string;
  feeUsd: number;
  slippageBps: number;
  route: string;
  estimated?: boolean;
  note?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  reputation: number;
  status: "active" | "idle" | "paused";
  paymentsEnabled: boolean;
  identity: string;
  actions24h: number;
  erc8004Id?: string;
  maxPayoutUsdc?: number;
  escrowEnabled?: boolean;
  batchEnabled?: boolean;
  x402Enabled?: boolean;
}

export interface AgentRegistration {
  standard: "ERC-8004";
  name: string;
  role: string;
  identity: string;
  chainId: number;
  chain: string;
  registeredAt: string;
  metadataUri: string;
  capabilities: string[];
}

export type JobPhase =
  | "created"
  | "budget_set"
  | "funded"
  | "submitted"
  | "completed"
  | "disputed"
  | "expired";

export interface AgentJob {
  id: string;
  standard: "ERC-8183";
  agentId: string;
  agentName: string;
  phase: JobPhase;
  budgetUsdc: string;
  description: string;
  recipient?: string;
  recipientLabel?: string;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{ phase: JobPhase; at: string; note?: string }>;
  txHash?: string;
}

export interface X402Receipt {
  protocol: "x402";
  status: "paid" | "pending" | "failed";
  tool: string;
  resource: string;
  amountUsdc: number;
  amountLabel: string;
  chainId: number;
  chain: string;
  payer?: string;
  paidAt: string;
  receiptId: string;
}

export interface PayrollRecipient {
  label: string;
  address: string;
  amountUsdc: string;
}

export interface CodeTemplate {
  id: string;
  title: string;
  description: string;
  category:
    | "bridge"
    | "swap"
    | "send"
    | "unified"
    | "component"
    | "contract"
    | "agent"
    | "x402"
    | "payroll"
    | "skills";
  language: string;
  code: string;
}
