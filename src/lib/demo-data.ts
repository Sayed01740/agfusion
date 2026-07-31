import type {
  AgentProfile,
  ChainBalance,
  CodeTemplate,
  TransactionRecord,
  UnifiedBalanceSnapshot,
} from "@/types";

export const DEMO_BALANCES: ChainBalance[] = [
  {
    chain: "Arc_Testnet",
    chainLabel: "Arc Testnet",
    token: "USDC",
    amount: 1240.5,
    usdValue: 1240.5,
    color: "#22d3ee",
  },
  {
    chain: "Base_Sepolia",
    chainLabel: "Base Sepolia",
    token: "USDC",
    amount: 850.0,
    usdValue: 850.0,
    color: "#0052ff",
  },
  {
    chain: "Ethereum_Sepolia",
    chainLabel: "Ethereum Sepolia",
    token: "USDC",
    amount: 420.25,
    usdValue: 420.25,
    color: "#627eea",
  },
  {
    chain: "Arbitrum_Sepolia",
    chainLabel: "Arbitrum Sepolia",
    token: "USDC",
    amount: 310.0,
    usdValue: 310.0,
    color: "#28a0f0",
  },
  {
    chain: "Arc_Testnet",
    chainLabel: "Arc Testnet",
    token: "EURC",
    amount: 180.0,
    usdValue: 195.3,
    color: "#a78bfa",
  },
];

export function getUnifiedSnapshot(): UnifiedBalanceSnapshot {
  const totalUsd = DEMO_BALANCES.reduce((s, b) => s + b.usdValue, 0);
  return {
    totalUsd,
    balances: DEMO_BALANCES,
    updatedAt: new Date().toISOString(),
  };
}

export const DEMO_TRANSACTIONS: TransactionRecord[] = [
  {
    id: "tx_demo_1",
    type: "bridge",
    status: "success",
    amount: "100.00",
    token: "USDC",
    fromChain: "Base_Sepolia",
    toChain: "Arc_Testnet",
    feeUsd: 0.12,
    steps: [
      { name: "Approve", state: "success" },
      { name: "Burn", state: "success" },
      { name: "Attestation", state: "success" },
      { name: "Mint", state: "success" },
    ],
    txHash: "0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890",
    explorerUrl: "https://testnet.arcscan.app",
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    message: "Transferred to Arc",
  },
  {
    id: "tx_demo_2",
    type: "send",
    status: "success",
    amount: "50.00",
    token: "USDC",
    fromChain: "Arc_Testnet",
    recipient: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    recipientLabel: "Sarah",
    feeUsd: 0.02,
    steps: [{ name: "Send", state: "success" }],
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: "tx_demo_3",
    type: "swap",
    status: "success",
    amount: "75.00",
    token: "USDC",
    tokenOut: "EURC",
    fromChain: "Arc_Testnet",
    feeUsd: 0.08,
    steps: [{ name: "Swap", state: "success" }],
    createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
  },
];

export const DEMO_AGENTS: AgentProfile[] = [
  {
    id: "agent_payroll",
    name: "Payroll Pilot",
    role: "Recurring stablecoin payouts · batch multi-send",
    reputation: 98,
    status: "active",
    paymentsEnabled: true,
    identity: "0x8004…a1b2",
    actions24h: 14,
    erc8004Id: "8004:payroll-pilot",
    maxPayoutUsdc: 50,
    escrowEnabled: true,
    batchEnabled: true,
    x402Enabled: false,
  },
  {
    id: "agent_treasury",
    name: "Treasury Router",
    role: "Cross-chain rebalancing · risk-aware routes",
    reputation: 94,
    status: "active",
    paymentsEnabled: true,
    identity: "0x8004…c3d4",
    actions24h: 7,
    erc8004Id: "8004:treasury-router",
    maxPayoutUsdc: 500,
    escrowEnabled: true,
    batchEnabled: false,
    x402Enabled: true,
  },
  {
    id: "agent_fx",
    name: "FX Copilot",
    role: "USDC ↔ EURC optimization · x402 quotes",
    reputation: 91,
    status: "idle",
    paymentsEnabled: true,
    identity: "0x8004…e5f6",
    actions24h: 3,
    maxPayoutUsdc: 200,
    escrowEnabled: false,
    batchEnabled: false,
    x402Enabled: true,
  },
];

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: "connect-arc",
    title: "Connect to Arc Testnet",
    description: "Arc Build: RPC, chain ID, and USDC as gas (from docs.arc.io)",
    category: "send",
    language: "typescript",
    code: `import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Arc Testnet — https://docs.arc.io/arc/references/connect-to-arc
export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
} as const;

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// Gas is paid in USDC — predictable, dollar-based fees
const balance = await publicClient.getBalance({ address: "0xYourAddress" });
console.log("USDC balance (wei):", balance.toString());`,
  },
  {
    id: "send-usdc",
    title: "Send USDC on Arc",
    description: "Peer-to-peer transfer with USDC gas and sub-second finality",
    category: "send",
    language: "typescript",
    code: `import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./arc-chain";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as \`0x\${string}\`);
const wallet = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

// Native USDC transfer on Arc (value is USDC with 18 decimals)
const hash = await wallet.sendTransaction({
  to: "0xRecipientAddress",
  value: parseUnits("25.00", 18),
});

console.log("Settled:", hash);
// Explorer: https://testnet.arcscan.app/tx/" + hash`,
  },
  {
    id: "bridge-basic",
    title: "Move USDC to Arc",
    description: "Cross-chain USDC from Base Sepolia to Arc Testnet",
    category: "bridge",
    language: "typescript",
    code: `import { createPublicClient, http } from "viem";

/**
 * Cross-chain USDC into Arc (testnet).
 * Official path: docs.arc.io → Bridge quickstarts
 * Faucet: https://faucet.circle.com
 */
const ARC = {
  chainId: 5042002,
  rpc: "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
};

// High-level flow (implement with your wallet + Circle tooling):
// 1. Approve USDC on source chain
// 2. Burn / lock on source
// 3. Wait for attestation
// 4. Mint / credit on Arc Testnet
// 5. Confirm on ArcScan — finality typically under 1s on Arc

console.log("Destination:", ARC);`,
  },
  {
    id: "swap-eurc",
    title: "Swap USDC → EURC",
    description: "Same-chain stablecoin FX on Arc Testnet",
    category: "swap",
    language: "typescript",
    code: `/**
 * Stablecoin FX on Arc — transparent pricing, instant settlement.
 * See: docs.arc.io/build/stablecoin-fx
 */
type SwapParams = {
  tokenIn: "USDC";
  tokenOut: "EURC";
  amountIn: string;
  slippageBps: number;
};

async function quoteStableFx(p: SwapParams) {
  // Wire to your liquidity venue / FX engine on Arc
  return {
    amountOut: (Number(p.amountIn) * 0.92).toFixed(2), // illustrative
    feeUsd: 0.04,
    chain: "Arc_Testnet",
  };
}

const quote = await quoteStableFx({
  tokenIn: "USDC",
  tokenOut: "EURC",
  amountIn: "50.00",
  slippageBps: 50,
});
console.log(quote);`,
  },
  {
    id: "unified-spend",
    title: "Unified balance spend",
    description: "Deposit multi-network USDC and spend on Arc",
    category: "unified",
    language: "typescript",
    code: `/**
 * Unified Balance — one spendable USDC view across chains.
 * Docs: https://docs.arc.io/app-kit/unified-balance
 */
type Deposit = { chain: string; amount: string };
type Spend = { amount: string; recipient: string; chain: "Arc_Testnet" };

async function depositAndSpend(deposit: Deposit, spend: Spend) {
  // 1) Deposit USDC from deposit.chain into unified pool
  // 2) Spend on Arc — routing is automatic
  return {
    deposited: deposit,
    spent: spend,
    status: "pending_confirmation" as const,
  };
}

await depositAndSpend(
  { chain: "Base_Sepolia", amount: "100.00" },
  { amount: "75.00", recipient: "0xRecipient", chain: "Arc_Testnet" },
);`,
  },
  {
    id: "next-payment",
    title: "Next.js payment button",
    description: "Simple Arc payment UI for product checkouts",
    category: "component",
    language: "tsx",
    code: `"use client";

import { useState } from "react";

export function PayButton({ amount, to }: { amount: string; to: string }) {
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function pay() {
    setStatus("pending");
    const res = await fetch("/api/actions/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        to,
        token: "USDC",
        chain: "Arc_Testnet",
      }),
    });
    if (res.ok) setStatus("done");
  }

  return (
    <button onClick={pay} disabled={status === "pending"}>
      {status === "done" ? "Paid" : \`Pay $\${amount} USDC\`}
    </button>
  );
}`,
  },
  {
    id: "agent-identity",
    title: "Register AI agent (ERC-8004)",
    description: "Arc Build — onchain identity + reputation for agents",
    category: "agent",
    language: "typescript",
    code: `/**
 * ERC-8004 agent identity on Arc
 * https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 */
export type AgentRegistration = {
  standard: "ERC-8004";
  name: string;
  role: string;
  identity: string;
  chainId: 5042002;
  maxPayoutUsdc: number;
  capabilities: string[];
};

export const payrollAgent: AgentRegistration = {
  standard: "ERC-8004",
  name: "Payroll Pilot",
  role: "Recurring stablecoin payouts",
  identity: "0x8004…a1b2",
  chainId: 5042002,
  maxPayoutUsdc: 50,
  capabilities: ["payments", "batch", "escrow"],
};`,
  },
  {
    id: "erc8183-job",
    title: "ERC-8183 job escrow",
    description: "Create → fund → deliver → settle USDC (agentic economy)",
    category: "agent",
    language: "typescript",
    code: `/**
 * ERC-8183 job lifecycle on Arc
 * https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job
 * Sample: https://github.com/circlefin/arc-escrow
 */
type JobPhase =
  | "created" | "budget_set" | "funded"
  | "submitted" | "completed" | "disputed";

async function runEscrowJob(budgetUsdc: string) {
  const phases: JobPhase[] = [
    "created", "budget_set", "funded", "submitted", "completed",
  ];
  for (const phase of phases) {
    console.log("ERC-8183", phase, budgetUsdc, "USDC");
    // wire to Arc contracts + USDC escrow
  }
  // final send settles with USDC gas on Arc (sub-second finality)
}

await runEscrowJob("12.50");`,
  },
  {
    id: "x402-micropay",
    title: "x402 micropayment (agent tool)",
    description: "HTTP 402 · agent pays USDC for API / risk oracle",
    category: "x402",
    language: "typescript",
    code: `/**
 * x402 — machine-to-machine USDC payments
 * Circle: turn your API into a storefront for agents
 * Pattern: request → 402 → pay USDC on Arc → retry with proof
 */
export type X402Receipt = {
  protocol: "x402";
  tool: string;
  amountUsdc: number;
  chainId: 5042002;
  status: "paid";
};

async function callPaidTool(url: string): Promise<X402Receipt> {
  let res = await fetch(url);
  if (res.status === 402) {
    // settle micropayment in USDC on Arc (Gateway / facilitator)
    const amountUsdc = 0.001;
    // ... pay, attach proof header, retry
    res = await fetch(url, {
      headers: { "X-PAYMENT": "usdc-arc-proof" },
    });
    return {
      protocol: "x402",
      tool: "risk_oracle",
      amountUsdc,
      chainId: 5042002,
      status: "paid",
    };
  }
  throw new Error("unexpected");
}`,
  },
  {
    id: "batch-payroll",
    title: "Batch payroll multi-send",
    description: "Pay many recipients in USDC on Arc (remittance style)",
    category: "payroll",
    language: "typescript",
    code: `/** Multi-send USDC on Arc Testnet — gas quoted per leg in USDC */
const recipients = [
  { label: "Sarah", to: "0x5a4a…", amount: "50" },
  { label: "Alex", to: "0xA11e…", amount: "75" },
];

for (const r of recipients) {
  // wallet.sendTransaction / kit.send with amount r.amount USDC
  console.log("pay", r.label, r.amount, "USDC · gas ~0.04 USDC");
}`,
  },
  {
    id: "circle-skills",
    title: "Circle Skills + Vercel Skills",
    description: "Prompt → deploy Arc apps with AI coding agents",
    category: "skills",
    language: "bash",
    code: `# Circle Skills + Vercel Skills — prompt to deployment on Arc
# https://www.circle.com/blog/from-prompt-to-deployment-with-circle-skills-and-vercel-skills

# Claude Code
# /plugin marketplace add circlefin/skills
# /plugin install circle-skills@circle

# Vercel Skills CLI
npx skills add circlefin/skills

# Arc skill covers: RPC, USDC gas, bridge, contracts
# Then: "Deploy a USDC pay button on Arc Testnet"`,
  },
  {
    id: "erc20",
    title: "ERC-20 on Arc",
    description: "Minimal Solidity token for Arc Testnet (EVM-compatible)",
    category: "contract",
    language: "solidity",
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 for Arc Testnet — deploy with Foundry/Hardhat/Viem
/// Gas is paid in USDC on Arc (see docs.arc.io gas & fees).
contract ArcStableToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        balanceOf[msg.sender] = _supply;
        emit Transfer(address(0), msg.sender, _supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
}`,
  },
];
