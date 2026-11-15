import {
  ARC_CHAIN_ID,
  ARC_NETWORK_NAME,
  IS_ARC_MAINNET,
} from "@/lib/arc-chain";
import {
  ARC_MAINNET_TOKENS,
  ARC_TESTNET_TOKENS,
  ARC_USDC_ADDRESS,
} from "@/lib/dapp/tokens";
import {
  ARC_PERMIT2_CONTRACT,
  ARC_PERMIT2_SPENDER,
} from "@/blockchain/uniswap-permit2";

export const ARC_KNOWLEDGE = {
  overview:
    "Arc is Circle's open, EVM-compatible Layer-1 blockchain — the Economic OS for programmable money — featuring native USDC gas, dollar-denominated fees, and sub-second deterministic finality.",
  cctpDomain: 26,
  mainnet: {
    name: "Arc Mainnet",
    chainId: 5042,
    chainIdHex: "0x13b2",
    rpcUrl: "https://rpc.mainnet.arc.network",
    wsUrl: "wss://rpc.mainnet.arc.network",
    explorerUrl: "https://explorer.arc.io",
    cctp: {
      domain: 26,
      tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
      supportedPeers: [
        "Base (8453, domain 6)",
        "Ethereum (1, domain 0)",
        "Arbitrum (42161, domain 3)",
        "Optimism (10, domain 2)",
        "Polygon (137, domain 7)",
        "Avalanche (43114, domain 1)",
        "Solana (domain 5)",
      ],
    },
    dex: {
      router: "Uniswap Universal Router 2.1.2",
      permit2: ARC_PERMIT2_CONTRACT,
      permit2Spender: ARC_PERMIT2_SPENDER,
      pairs: ["USDC ↔ EURC", "USDC ↔ cirBTC", "EURC ↔ cirBTC"],
    },
    tokens: ARC_MAINNET_TOKENS,
  },
  testnet: {
    name: "Arc Testnet",
    chainId: 5042002,
    chainIdHex: "0x4cef52",
    rpcUrl: "https://rpc.testnet.arc.network",
    wsUrl: "wss://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    faucetUrl: "https://faucet.circle.com",
    cctp: {
      domain: 26,
      tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
      messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
      supportedPeers: [
        "Base Sepolia (84532)",
        "Ethereum Sepolia (11155111)",
        "Arbitrum Sepolia (421614)",
        "OP Sepolia (11155420)",
        "Polygon Amoy (80002)",
        "Avalanche Fuji (43113)",
        "Solana Devnet",
      ],
    },
    tokens: ARC_TESTNET_TOKENS,
  },
  protocols: {
    erc8004: "ERC-8004 registers autonomous AI agent identity and reputation on-chain on Arc.",
    erc8183: "ERC-8183 enables trustless USDC job escrow: create → fund escrow → submit deliverable → settle.",
    x402: "x402 uses HTTP 402 Payment Required for machine-to-machine USDC micropayments (e.g. Risk Oracle & paid agent APIs).",
    unifiedBalance: "Circle Gateway Unified Balance lets users deposit USDC from Ethereum/Base/Arbitrum/etc. and spend instantly on Arc.",
    payroll: "Batch Payroll / CSV Disperse sends USDC to multiple recipients on Arc in one workflow with USDC gas quotes.",
  },
} as const;

export const ARC_SYSTEM_KNOWLEDGE_BLOCK = `Arc Network Reference (verified AGFusion registry):
- Overview: ${ARC_KNOWLEDGE.overview}
- Native Gas: USDC (6-decimal ERC-20 interface at ${ARC_USDC_ADDRESS}; dollar-denominated fees, no ETH needed).
- Arc Mainnet: Chain ID 5042 (0x13b2) | RPC: https://rpc.mainnet.arc.network | Explorer: https://explorer.arc.io
  - Tokens: USDC (${ARC_MAINNET_TOKENS.USDC.address}, 6 dec), EURC (${ARC_MAINNET_TOKENS.EURC.address}, 6 dec), cirBTC (${ARC_MAINNET_TOKENS.cirBTC.address}, 8 dec)
  - DEX Swap: Uniswap Universal Router 2.1.2 + Permit2 (${ARC_PERMIT2_CONTRACT})
  - CCTP v2 (Domain 26): TokenMessenger ${ARC_KNOWLEDGE.mainnet.cctp.tokenMessenger} | MessageTransmitter ${ARC_KNOWLEDGE.mainnet.cctp.messageTransmitter}
  - Mainnet Bridge Peers: Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Solana
- Arc Testnet: Chain ID 5042002 (0x4cef52) | RPC: https://rpc.testnet.arc.network | Explorer: https://testnet.arcscan.app | Faucet: https://faucet.circle.com
  - Tokens: USDC (${ARC_TESTNET_TOKENS.USDC.address}, 6 dec), EURC (${ARC_TESTNET_TOKENS.EURC.address}, 6 dec), cirBTC (${ARC_TESTNET_TOKENS.cirBTC.address}, 8 dec)
  - CCTP v2 (Domain 26): TokenMessenger ${ARC_KNOWLEDGE.testnet.cctp.tokenMessenger} | MessageTransmitter ${ARC_KNOWLEDGE.testnet.cctp.messageTransmitter}
  - Testnet Bridge Peers: Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, Solana Devnet
- Agentic Stack: ERC-8004 (on-chain agent identity), ERC-8183 (USDC milestone escrow), x402 (HTTP 402 micropayments), Unified Balance (Circle Gateway), Batch CSV Payroll.`;

export function answerArcKnowledgeQuery(rawQuery: string): string {
  const q = rawQuery.toLowerCase();

  if (/\b(token|contract|address|eurc|cirbtc|usdc)\b/.test(q) && !/\b(cctp|bridge|domain)\b/.test(q)) {
    return [
      "**Verified Arc Token Contracts:**",
      "",
      "**Arc Mainnet (Chain `5042`):**",
      `• **USDC (Native Gas, 6 dec):** \`${ARC_MAINNET_TOKENS.USDC.address}\``,
      `• **EURC (6 dec):** \`${ARC_MAINNET_TOKENS.EURC.address}\``,
      `• **cirBTC (8 dec):** \`${ARC_MAINNET_TOKENS.cirBTC.address}\``,
      "",
      "**Arc Testnet (Chain `5042002`):**",
      `• **USDC (Native Gas, 6 dec):** \`${ARC_TESTNET_TOKENS.USDC.address}\``,
      `• **EURC (6 dec):** \`${ARC_TESTNET_TOKENS.EURC.address}\``,
      `• **cirBTC (8 dec):** \`${ARC_TESTNET_TOKENS.cirBTC.address}\``,
    ].join("\n");
  }

  if (/\b(cctp|bridge|domain|peer|supported chain|which chain|transfer)\b/.test(q)) {
    return [
      "**Arc Cross-Chain Bridge (Circle CCTP v2):**",
      "",
      "• **Arc CCTP Domain ID:** `26`",
      `• **Mainnet TokenMessenger:** \`${ARC_KNOWLEDGE.mainnet.cctp.tokenMessenger}\``,
      `• **Mainnet MessageTransmitter:** \`${ARC_KNOWLEDGE.mainnet.cctp.messageTransmitter}\``,
      `• **Mainnet Supported Peers:** ${ARC_KNOWLEDGE.mainnet.cctp.supportedPeers.join(", ")}`,
      "",
      `• **Testnet TokenMessenger:** \`${ARC_KNOWLEDGE.testnet.cctp.tokenMessenger}\``,
      `• **Testnet MessageTransmitter:** \`${ARC_KNOWLEDGE.testnet.cctp.messageTransmitter}\``,
      `• **Testnet Supported Peers:** ${ARC_KNOWLEDGE.testnet.cctp.supportedPeers.join(", ")}`,
      "",
      "Flow: `Approve USDC → Burn on Source → Circle Iris Attestation → Mint on Destination` (with step recovery).",
    ].join("\n");
  }

  if (/\b(swap|dex|uniswap|permit2|slippage|fx)\b/.test(q)) {
    return [
      "**Arc DEX & Stablecoin FX Swap:**",
      "",
      "• **Supported Pairs:** `USDC ↔ EURC ↔ cirBTC`",
      `• **Mainnet Router:** ${ARC_KNOWLEDGE.mainnet.dex.router}`,
      `• **Mainnet Permit2:** \`${ARC_PERMIT2_CONTRACT}\` (Spender: \`${ARC_PERMIT2_SPENDER}\`)`,
      "• **Security:** Server-validated quote sessions, simulation preflight, and slippage protection (0.1%–5%).",
    ].join("\n");
  }

  if (/\b(chain id|rpc|explorer|faucet|network|mainnet|testnet|websocket|wss)\b/.test(q)) {
    return [
      `**Arc Network Configuration (Default: ${ARC_NETWORK_NAME} · Chain \`${ARC_CHAIN_ID}\`):**`,
      "",
      "**Arc Mainnet:**",
      "• **Chain ID:** `5042` (`0x13b2`)",
      "• **RPC:** `https://rpc.mainnet.arc.network` | **WS:** `wss://rpc.mainnet.arc.network`",
      "• **Explorer:** https://explorer.arc.io",
      "",
      "**Arc Testnet:**",
      "• **Chain ID:** `5042002` (`0x4cef52`)",
      "• **RPC:** `https://rpc.testnet.arc.network` | **WS:** `wss://rpc.testnet.arc.network`",
      "• **Explorer:** https://testnet.arcscan.app | **Faucet:** https://faucet.circle.com",
    ].join("\n");
  }

  if (/\b(gas|fee|finality|speed)\b/.test(q)) {
    return [
      "**Arc Gas & Finality:**",
      "",
      `• **Native Gas Token:** **USDC** (\`${ARC_USDC_ADDRESS}\` — no ETH required for gas).`,
      "• **Fees:** Predictable, dollar-denominated gas line items ideal for payments and autonomous agents.",
      "• **Finality:** Sub-second deterministic finality (<1s).",
    ].join("\n");
  }

  if (/\b(8004|8183|x402|escrow|agent|payroll|unified|gateway)\b/.test(q)) {
    return [
      "**Arc Agentic Economy & AGFusion Protocols:**",
      "",
      `• **ERC-8004:** ${ARC_KNOWLEDGE.protocols.erc8004}`,
      `• **ERC-8183:** ${ARC_KNOWLEDGE.protocols.erc8183}`,
      `• **x402:** ${ARC_KNOWLEDGE.protocols.x402}`,
      `• **Unified Balance:** ${ARC_KNOWLEDGE.protocols.unifiedBalance}`,
      `• **Batch Payroll:** ${ARC_KNOWLEDGE.protocols.payroll}`,
    ].join("\n");
  }

  return [
    `**Arc Network (${IS_ARC_MAINNET ? "Mainnet" : "Testnet"} Default · Chain \`${ARC_CHAIN_ID}\`):**`,
    "",
    ARC_KNOWLEDGE.overview,
    "",
    "• **Mainnet:** Chain `5042` (`0x13b2`) · RPC `https://rpc.mainnet.arc.network` · Explorer https://explorer.arc.io",
    "• **Testnet:** Chain `5042002` (`0x4cef52`) · RPC `https://rpc.testnet.arc.network` · Faucet https://faucet.circle.com",
    `• **Tokens:** USDC (\`${ARC_USDC_ADDRESS}\`), EURC, cirBTC`,
    "• **CCTP v2 Domain:** `26` (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Solana)",
    "• **Protocols:** Uniswap Universal Router 2.1.2 + Permit2, ERC-8004, ERC-8183, x402, Unified Balance.",
  ].join("\n");
}
