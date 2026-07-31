import type {
  ActionPreview,
  ChatMessage,
  CodeBlock,
  ParsedIntent,
  TransactionRecord,
} from "@/types";
import { parseIntent } from "@/ai/intent";
import { CHAINS } from "@/lib/chains";
import { CODE_TEMPLATES } from "@/lib/demo-data";
import { formatUsd, uid } from "@/lib/utils";
import {
  estimateBridgeDemo,
  estimateSwapDemo,
  runBridgeFlow,
  runSendFlow,
  runSwapFlow,
  runUnifiedRouteFlow,
} from "@/blockchain/appkit-service";

export interface OrchestratorResult {
  message: ChatMessage;
  transaction?: TransactionRecord;
  autoExecute?: boolean;
}

function codeForTopic(topic?: string): CodeBlock[] {
  const tpl =
    CODE_TEMPLATES.find((t) => t.category === topic) || CODE_TEMPLATES[0];
  return [
    {
      language: tpl.language,
      filename: `${tpl.id}.${tpl.language === "solidity" ? "sol" : tpl.language === "tsx" ? "tsx" : "ts"}`,
      code: tpl.code,
    },
  ];
}

function buildPreview(intent: ParsedIntent): ActionPreview | undefined {
  const from = intent.fromChain ? CHAINS[intent.fromChain] : undefined;
  const to = intent.toChain ? CHAINS[intent.toChain] : undefined;

  switch (intent.type) {
    case "bridge": {
      const est = estimateBridgeDemo(
        intent.amount || "50",
        intent.fromChain || "Base_Sepolia",
        intent.toChain || "Arc_Testnet",
      );
      return {
        type: "bridge",
        title: "Transfer USDC",
        summary: `Move ${intent.amount} ${intent.token} from ${from?.label ?? "source"} → ${to?.label ?? "Arc"}`,
        amount: intent.amount,
        token: intent.token,
        fromChain: intent.fromChain || "Base_Sepolia",
        toChain: intent.toChain || "Arc_Testnet",
        estimatedFeeUsd: est.feeUsd + est.gasUsd,
        estimatedTime: est.eta,
        route: [from?.short ?? "?", "→", to?.short ?? "Arc"],
        plan: [
          { id: "est", label: "Estimate fees", detail: formatUsd(est.feeUsd + est.gasUsd) },
          { id: "approve", label: "Approve USDC" },
          { id: "burn", label: "Lock on source" },
          { id: "attest", label: "Attestation" },
          { id: "mint", label: "Credit on destination" },
        ],
        canExecute: true,
        requiresWallet: true,
      };
    }
    case "swap": {
      const est = estimateSwapDemo(
        intent.amount || "50",
        intent.token || "USDC",
        intent.tokenOut || "EURC",
      );
      return {
        type: "swap",
        title: `Swap ${intent.token} → ${intent.tokenOut}`,
        summary: `Exchange ${intent.amount} ${intent.token} for ~${est.amountOut} ${intent.tokenOut} on ${to?.label ?? "Arc"}`,
        amount: intent.amount,
        token: intent.token,
        tokenOut: intent.tokenOut || "EURC",
        toChain: intent.toChain || "Arc_Testnet",
        estimatedFeeUsd: est.feeUsd,
        estimatedTime: "~2s",
        route: [intent.token || "USDC", "FX", intent.tokenOut || "EURC"],
        plan: [
          { id: "quote", label: "Get FX quote", detail: `~${est.amountOut} ${intent.tokenOut}` },
          { id: "approve", label: "Approve / permit" },
          { id: "swap", label: "Execute swap on Arc" },
        ],
        canExecute: true,
        requiresWallet: true,
      };
    }
    case "send":
      return {
        type: "send",
        title: intent.recipientLabel
          ? `Pay ${intent.recipientLabel}`
          : "Send payment",
        summary: `Send ${intent.amount} ${intent.token} to ${intent.recipientLabel || intent.recipient || "recipient"} on ${to?.label ?? "Arc"}`,
        amount: intent.amount,
        token: intent.token,
        toChain: intent.toChain || "Arc_Testnet",
        recipient: intent.recipient,
        recipientLabel: intent.recipientLabel,
        estimatedFeeUsd: 0.02,
        estimatedTime: "<1s",
        plan: [
          { id: "resolve", label: "Resolve recipient" },
          { id: "estimate", label: "Estimate gas (USDC)" },
          { id: "sign", label: "Sign & send on Arc" },
        ],
        canExecute: Boolean(intent.recipient),
        requiresWallet: true,
      };
    case "route":
      return {
        type: "route",
        title: "Transfer + pay",
        summary: `Move ${intent.amount} ${intent.token} to Arc and pay ${intent.recipientLabel || "recipient"}`,
        amount: intent.amount,
        token: intent.token,
        fromChain: intent.fromChain || "Base_Sepolia",
        toChain: "Arc_Testnet",
        recipient: intent.recipient,
        recipientLabel: intent.recipientLabel,
        estimatedFeeUsd: 0.18,
        estimatedTime: "~18s",
        route: [
          from?.short || "Base",
          "→",
          "Arc",
          intent.recipientLabel || "Pay",
        ],
        plan: [
          { id: "analyze", label: "Select lowest-cost route" },
          { id: "bridge", label: "Transfer USDC to Arc" },
          { id: "settle", label: "Settle on Arc (sub-second finality)" },
          {
            id: "pay",
            label: `Pay ${intent.recipientLabel || "recipient"}`,
          },
        ],
        canExecute: Boolean(intent.recipient),
        requiresWallet: true,
      };
    default:
      return undefined;
  }
}

function narrative(intent: ParsedIntent, preview?: ActionPreview): string {
  switch (intent.type) {
    case "balance":
      return [
        "**Balances**",
        "",
        "Connect your wallet to load **live Arc USDC** from RPC.",
        "We never invent multi-chain demo balances.",
        "",
        "Try: `Show my balances` after connecting on Arc Testnet.",
      ].join("\n");

    case "bridge":
      return [
        `Preparing to move **${intent.amount} ${intent.token}** to Arc.`,
        "",
        `**Route:** ${preview?.route?.join(" → ")}`,
        `**Est. fees:** ${formatUsd(preview?.estimatedFeeUsd ?? 0)}`,
        `**ETA:** ${preview?.estimatedTime}`,
        "",
        "Steps: approve → lock/burn on source → attestation → credit on Arc. Progress is tracked for recovery if needed.",
      ].join("\n");

    case "swap":
      return [
        `Swapping **${intent.amount} ${intent.token} → ${intent.tokenOut}** on ${intent.toChain ? CHAINS[intent.toChain].label : "Arc"}.`,
        "",
        "Stablecoin FX with transparent fees and sub-second settlement on Arc. Confirm to execute.",
      ].join("\n");

    case "send":
      return [
        `Payment ready: **${intent.amount} ${intent.token}** → **${intent.recipientLabel || intent.recipient}**.`,
        "",
        intent.recipient
          ? `Recipient resolved to \`${intent.recipient}\` on ${intent.toChain ? CHAINS[intent.toChain].label : "Arc"}.`
          : "I need a username or address to complete this send.",
        "",
        "On Arc, gas is paid in USDC — predictable, dollar-based fees.",
      ].join("\n");

    case "route":
      return [
        `**Payment plan**`,
        "",
        `1. Select lowest-cost path for **${intent.amount} ${intent.token}**`,
        `2. Move funds ${intent.fromChain ? CHAINS[intent.fromChain].short : "Base"} → Arc`,
        `3. Settle on Arc (sub-second finality)`,
        `4. Pay **${intent.recipientLabel || "recipient"}**`,
        "",
        `Est. total cost: **${formatUsd(preview?.estimatedFeeUsd ?? 0.18)}** · ETA **${preview?.estimatedTime}**`,
        "",
        "Confirm to run the full flow.",
      ].join("\n");

    case "code":
      return [
        `Here's Arc-ready code for **${intent.codeTopic || "send"}** — aligned with Arc Build docs.`,
        "",
        "Use Viem/Foundry on Arc Testnet (chain `5042002`, RPC `https://rpc.testnet.arc.network`).",
        "I can also scaffold a Next.js payment component or deploy script — just ask.",
      ].join("\n");

    case "deploy":
      return [
        `Deployment assistant ready for **${intent.codeTopic === "contract" ? "ERC-20" : "contract"}** on Arc Testnet.`,
        "",
        "Arc is EVM-compatible with **USDC as gas**. Use Foundry, Hardhat, or Viem.",
        "Chain ID: `5042002` · RPC: `https://rpc.testnet.arc.network`",
        "",
        "Here's a starter contract. Say **deploy this** when your wallet is connected.",
      ].join("\n");

    case "agent":
      return [
        "**Agents (Arc agentic economy)**",
        "",
        "• Onchain identity and reputation (ERC-8004 patterns)",
        "• Policy-bound, payment-capable workflows",
        "• Payroll, treasury routing, and FX copilots",
        "",
        "Open the Agents page to view policies and run a job under your limits.",
      ].join("\n");

    case "explain":
      return [
        "I can diagnose failed transfers (approve / burn / attestation / mint), recover incomplete routes, and explain fees in USDC terms.",
        "",
        "Paste a transaction hash or describe the failure and I'll help.",
      ].join("\n");

    default:
      return [
        "I'm **AGFusion** — your workspace for stablecoin payments, treasury, and builders on Arc.",
        "",
        "Try things like:",
        '• "Show my balances"',
        '• "Swap 1 USDC to EURC"',
        '• "Bridge 5 USDC from Arc to Base"',
        '• "Bridge 5 USDC from Base to Arc"',
        '• "Generate send USDC code for Arc"',
      ].join("\n");
  }
}

export async function orchestrateUserMessage(
  content: string,
  options?: { execute?: boolean },
): Promise<OrchestratorResult> {
  const intent = parseIntent(content);
  const preview = buildPreview(intent);
  const codeBlocks =
    intent.type === "code" || intent.type === "deploy"
      ? codeForTopic(intent.codeTopic)
      : undefined;

  let transaction: TransactionRecord | undefined;

  if (options?.execute && preview?.canExecute) {
    if (intent.type === "bridge") {
      transaction = await runBridgeFlow({
        amount: intent.amount || "50",
        token: intent.token || "USDC",
        fromChain: intent.fromChain || "Base_Sepolia",
        toChain: intent.toChain || "Arc_Testnet",
      });
    } else if (intent.type === "swap") {
      transaction = await runSwapFlow({
        amount: intent.amount || "50",
        tokenIn: intent.token || "USDC",
        tokenOut: intent.tokenOut || "EURC",
        chain: intent.toChain || "Arc_Testnet",
      });
    } else if (intent.type === "send") {
      if (!intent.recipient || !/^0x[a-fA-F0-9]{40}$/.test(intent.recipient)) {
        /* plan only — no live send without real 0x */
      } else {
        transaction = await runSendFlow({
          amount: intent.amount || "50",
          token: intent.token || "USDC",
          chain: intent.toChain || "Arc_Testnet",
          recipient: intent.recipient,
          recipientLabel: intent.recipientLabel,
        });
      }
    } else if (intent.type === "route") {
      if (!intent.recipient || !/^0x[a-fA-F0-9]{40}$/.test(intent.recipient)) {
        /* plan only */
      } else {
        transaction = await runUnifiedRouteFlow({
          amount: intent.amount || "100",
          token: intent.token || "USDC",
          fromChain: intent.fromChain || "Base_Sepolia",
          recipient: intent.recipient,
          recipientLabel: intent.recipientLabel,
        });
      }
    }
  }

  const message: ChatMessage = {
    id: uid("msg"),
    role: "assistant",
    content: narrative(intent, preview),
    createdAt: new Date().toISOString(),
    intent: intent.type,
    actionPreview: options?.execute ? undefined : preview,
    transactionId: transaction?.id,
    codeBlocks,
  };

  if (transaction?.status === "success") {
    message.content =
      message.content +
      `\n\n✅ **Completed** — ${transaction.type} of ${transaction.amount} ${transaction.token}` +
      (transaction.recipientLabel
        ? ` to ${transaction.recipientLabel}`
        : "") +
      ".";
  }

  return { message, transaction };
}

export function welcomeMessage(): ChatMessage {
  return {
    id: uid("msg"),
    role: "assistant",
    content: [
      "Hi — I’m the **AGFusion** helper.",
      "",
      "**What this app is for:** send USDC, swap USDC↔EURC, or bridge USDC between networks — on Arc Testnet (practice money).",
      "",
      "**How to start (3 steps):**",
      "1. Click **Connect** (top right) → choose your wallet → **Arc Testnet**",
      "2. Get free test USDC: https://faucet.circle.com (pick Arc Testnet)",
      "3. Try one of these:",
      '   • Type: **Show my balances**',
      "   • Or use **Payment Engine** on the right (send 0.05 USDC to a full 0x address)",
      '   • Or: **Swap 1 USDC to EURC**',
      "",
      "I will **plan first**. Money only moves after you press **Confirm** and approve in your wallet.",
      "",
      "Confused? Open **“New here? What is this app?”** on the right panel.",
    ].join("\n"),
    createdAt: new Date().toISOString(),
    intent: "unknown",
  };
}
