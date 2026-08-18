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
  const tpl = CODE_TEMPLATES.find((t) => t.category === topic) || CODE_TEMPLATES[0];
  return [{ language: tpl.language, filename: `${tpl.id}.${tpl.language === "solidity" ? "sol" : tpl.language === "tsx" ? "tsx" : "ts"}`, code: tpl.code }];
}

function buildPreview(intent: ParsedIntent): ActionPreview | undefined {
  const from = intent.fromChain ? CHAINS[intent.fromChain] : undefined;
  const to = intent.toChain ? CHAINS[intent.toChain] : undefined;
  const hasAmount = Boolean(intent.amount && Number(intent.amount) > 0);

  switch (intent.type) {
    case "bridge": {
      const complete = hasAmount && Boolean(intent.fromChain && intent.toChain && intent.fromChain !== intent.toChain);
      if (!complete) {
        return {
          type: "bridge",
          title: "Bridge USDC",
          summary: "I need the amount and both source and destination networks before I can prepare a bridge.",
          amount: intent.amount,
          token: intent.token,
          fromChain: intent.fromChain,
          toChain: intent.toChain,
          plan: [{ id: "details", label: "Specify amount + source + destination" }],
          canExecute: false,
          requiresWallet: true,
        };
      }
      const est = estimateBridgeDemo(intent.amount!, intent.fromChain!, intent.toChain!);
      return {
        type: "bridge",
        title: "Transfer USDC",
        summary: `Move ${intent.amount} ${intent.token} from ${from?.label ?? "source"} → ${to?.label ?? "destination"}`,
        amount: intent.amount,
        token: intent.token,
        fromChain: intent.fromChain,
        toChain: intent.toChain,
        estimatedFeeUsd: est.feeUsd + est.gasUsd,
        estimatedTime: est.eta,
        route: [from?.short ?? "?", "→", to?.short ?? "?"],
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
      const complete = hasAmount && Boolean(intent.token && intent.tokenOut && intent.toChain);
      if (!complete) {
        return {
          type: "swap",
          title: "Swap tokens",
          summary: "I need the amount, input/output tokens, and network before I can prepare a swap.",
          amount: intent.amount,
          token: intent.token,
          tokenOut: intent.tokenOut,
          toChain: intent.toChain,
          plan: [{ id: "details", label: "Specify amount + token pair + network" }],
          canExecute: false,
          requiresWallet: true,
        };
      }
      const est = estimateSwapDemo(intent.amount!, intent.token!, intent.tokenOut!);
      return {
        type: "swap",
        title: `Swap ${intent.token} → ${intent.tokenOut}`,
        summary: `Exchange ${intent.amount} ${intent.token} for ~${est.amountOut} ${intent.tokenOut} on ${to?.label ?? "the selected network"}`,
        amount: intent.amount,
        token: intent.token,
        tokenOut: intent.tokenOut,
        toChain: intent.toChain,
        estimatedFeeUsd: est.feeUsd,
        estimatedTime: "~2s",
        route: [intent.token!, "FX", intent.tokenOut!],
        plan: [
          { id: "quote", label: "Get FX quote", detail: `~${est.amountOut} ${intent.tokenOut}` },
          { id: "approve", label: "Approve / permit" },
          { id: "swap", label: "Execute swap" },
        ],
        canExecute: true,
        requiresWallet: true,
      };
    }
    case "send": {
      const complete = hasAmount && Boolean(intent.recipient && intent.toChain);
      return {
        type: "send",
        title: intent.recipientLabel ? `Pay ${intent.recipientLabel}` : "Send payment",
        summary: complete
          ? `Send ${intent.amount} ${intent.token} to ${intent.recipient} on ${to?.label ?? "the selected network"}`
          : "I need a valid 0x recipient, amount, and network before I can prepare the payment.",
        amount: intent.amount,
        token: intent.token,
        toChain: intent.toChain,
        recipient: intent.recipient,
        recipientLabel: intent.recipientLabel,
        estimatedFeeUsd: complete ? 0.02 : undefined,
        estimatedTime: complete ? "<1s" : undefined,
        plan: complete
          ? [
              { id: "resolve", label: "Resolve recipient" },
              { id: "estimate", label: "Estimate gas" },
              { id: "sign", label: "Sign & send" },
            ]
          : [{ id: "details", label: "Specify amount + valid recipient + network" }],
        canExecute: complete,
        requiresWallet: true,
      };
    }
    case "route": {
      const complete = hasAmount && Boolean(intent.fromChain && intent.toChain && intent.recipient && intent.fromChain !== intent.toChain);
      return {
        type: "route",
        title: "Transfer + pay",
        summary: complete
          ? `Move ${intent.amount} ${intent.token} from ${from?.label} to ${to?.label}, then pay ${intent.recipient}`
          : "I need an explicit amount, source, destination, and recipient before preparing a route.",
        amount: intent.amount,
        token: intent.token,
        fromChain: intent.fromChain,
        toChain: intent.toChain,
        recipient: intent.recipient,
        recipientLabel: intent.recipientLabel,
        estimatedFeeUsd: complete ? 0.18 : undefined,
        estimatedTime: complete ? "~18s" : undefined,
        route: complete ? [from?.short || "Source", "→", to?.short || "Destination", intent.recipientLabel || "Pay"] : undefined,
        plan: complete
          ? [
              { id: "analyze", label: "Validate route" },
              { id: "bridge", label: "Transfer USDC" },
              { id: "settle", label: "Verify destination settlement" },
              { id: "pay", label: `Pay ${intent.recipientLabel || "recipient"}` },
            ]
          : [{ id: "details", label: "Specify all route details" }],
        canExecute: complete,
        requiresWallet: true,
      };
    }
    default:
      return undefined;
  }
}

function narrative(intent: ParsedIntent, preview?: ActionPreview): string {
  switch (intent.type) {
    case "balance":
      return ["**Balances**", "", "Connect your wallet to load **live Arc USDC** from RPC.", "We never invent multi-chain demo balances.", "", "Try: `Show my balances` after connecting on Arc Testnet."].join("\n");
    case "bridge":
      return [
        preview?.canExecute ? `Preparing to move **${intent.amount} ${intent.token}**.` : "I can prepare the bridge, but I need the missing amount and/or source/destination networks first.",
        "",
        preview?.route ? `**Route:** ${preview.route.join(" → ")}` : "**Route:** source → destination",
        preview?.estimatedFeeUsd !== undefined ? `**Est. fees:** ${formatUsd(preview.estimatedFeeUsd)}` : "**Fees:** calculated after the route is specified",
        preview?.estimatedTime ? `**ETA:** ${preview.estimatedTime}` : "",
        "",
        "Steps: approve → burn on source → attestation → mint on destination. Final success requires an on-chain receipt.",
      ].filter(Boolean).join("\n");
    case "swap":
      return preview?.canExecute
        ? [`Swapping **${intent.amount} ${intent.token} → ${intent.tokenOut}** on ${intent.toChain ? CHAINS[intent.toChain].label : "the selected network"}.`, "", "Confirm the exact quote and approve in your wallet before execution."].join("\n")
        : "I can prepare the swap once you provide the amount, token pair, and supported network.";
    case "send":
      return [`Payment ${preview?.canExecute ? "ready" : "needs details"}: **${intent.amount ?? "amount"} ${intent.token}** → **${intent.recipientLabel || intent.recipient || "recipient"}**.`, "", intent.recipient ? `Recipient: \`${intent.recipient}\` on ${intent.toChain ? CHAINS[intent.toChain].label : "the selected network"}.` : "I need a valid 0x recipient before any payment can be executed.", "", "The transaction will only be sent after explicit confirmation and wallet signing."].join("\n");
    case "route":
      return preview?.canExecute
        ? [`**Payment plan**`, "", `1. Validate ${intent.fromChain ? CHAINS[intent.fromChain].short : "source"} → ${intent.toChain ? CHAINS[intent.toChain].short : "destination"}`, `2. Move **${intent.amount} ${intent.token}**`, `3. Verify destination settlement`, `4. Pay **${intent.recipientLabel || intent.recipient}**`, "", "Confirm to run the complete flow."].join("\n")
        : "I can build the transfer-and-pay plan once the amount, source, destination, and recipient are explicit.";
    case "code":
      return [`Here's Arc-ready code for **${intent.codeTopic || "send"}** — aligned with Arc Build docs.`, "", "Use Viem/Foundry on Arc Testnet (chain `5042002`).", "I can also scaffold a Next.js payment component or deploy script."].join("\n");
    case "deploy":
      return [`Deployment assistant ready for **${intent.codeTopic === "contract" ? "ERC-20" : "contract"}** on Arc Testnet.`, "", "Arc is EVM-compatible with **USDC as gas**.", "Chain ID: `5042002`", "", "I'll keep deployment user-authorized and wallet-signed."].join("\n");
    case "agent":
      return ["**AGFusion Operator**", "", "• Interpret financial intent", "• Prepare policy-bound actions", "• Request explicit user confirmation", "• Execute through the connected wallet", "• Verify the resulting on-chain state", "", "The agent never treats its own plan as authorization."].join("\n");
    case "explain":
      return ["I can diagnose failed transfers (approve / burn / attestation / mint), recover incomplete routes, and explain fees in USDC terms.", "", "Paste a transaction hash or describe the failure and I'll help."].join("\n");
    default:
      return ["I'm **AGFusion** — an AI-native workspace for stablecoin operations on Arc and supported EVM networks.", "", "Try:", '• "Show my balances"', '• "Swap 1 USDC to EURC on Arc"', '• "Bridge 5 USDC from Arc to Base"', '• "Bridge 5 USDC from Base to Arc"', '• "Send 2 USDC to 0x... on Arc"'].join("\n");
  }
}

export async function orchestrateUserMessage(content: string, options?: { execute?: boolean }): Promise<OrchestratorResult> {
  const intent = parseIntent(content);
  const preview = buildPreview(intent);
  const codeBlocks = intent.type === "code" || intent.type === "deploy" ? codeForTopic(intent.codeTopic) : undefined;
  let transaction: TransactionRecord | undefined;

  // A financial action may execute only when the parsed intent is complete.
  // Never fill missing amount/chain/recipient values with silent defaults.
  if (options?.execute && preview?.canExecute) {
    if (intent.type === "bridge" && intent.amount && intent.fromChain && intent.toChain) {
      transaction = await runBridgeFlow({ amount: intent.amount, token: intent.token || "USDC", fromChain: intent.fromChain, toChain: intent.toChain });
    } else if (intent.type === "swap" && intent.amount && intent.token && intent.tokenOut && intent.toChain) {
      transaction = await runSwapFlow({ amount: intent.amount, tokenIn: intent.token, tokenOut: intent.tokenOut, chain: intent.toChain });
    } else if (intent.type === "send" && intent.amount && intent.recipient && intent.toChain && /^0x[a-fA-F0-9]{40}$/.test(intent.recipient)) {
      transaction = await runSendFlow({ amount: intent.amount, token: intent.token || "USDC", chain: intent.toChain, recipient: intent.recipient, recipientLabel: intent.recipientLabel });
    } else if (intent.type === "route" && intent.amount && intent.fromChain && intent.toChain && intent.recipient && /^0x[a-fA-F0-9]{40}$/.test(intent.recipient)) {
      transaction = await runUnifiedRouteFlow({ amount: intent.amount, token: intent.token || "USDC", fromChain: intent.fromChain, toChain: intent.toChain, recipient: intent.recipient, recipientLabel: intent.recipientLabel });
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
    message.content += `\n\n✅ **Completed** — ${transaction.type} of ${transaction.amount} ${transaction.token}${transaction.recipientLabel ? ` to ${transaction.recipientLabel}` : ""}.`;
  }

  return { message, transaction };
}

export function welcomeMessage(): ChatMessage {
  return {
    id: uid("msg"),
    role: "assistant",
    content: [
      "Hi — I’m the **AGFusion Operator**.",
      "",
      "I can plan stablecoin operations across Arc and supported EVM networks: bridge, swap, send, balance and route analysis.",
      "",
      "**Safety:** I plan first. Money only moves after you confirm the exact action and approve it in your wallet.",
      "",
      "Try:",
      '• **Show my balances**',
      '• **Swap 1 USDC to EURC on Arc**',
      '• **Bridge 5 USDC from Base to Arc**',
      '• **Send 0.05 USDC to a full 0x address on Arc**',
    ].join("\n"),
    createdAt: new Date().toISOString(),
    intent: "unknown",
  };
}
