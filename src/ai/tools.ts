/**
 * AGFusion agent tools — small, verifiable capabilities.
 * Used by the local planner and optional xAI function-calling loop.
 */

import type {
  ActionPreview,
  BridgeEstimate,
  ChainId,
  CodeBlock,
  SwapEstimate,
  TransactionRecord,
  UnifiedBalanceSnapshot,
} from "@/types";
import { CODE_TEMPLATES } from "@/lib/demo-data";
import {
  emptyBalanceSnapshot,
  isValidEvmAddress,
  requireSafeRecipient,
} from "@/lib/balances-empty";
import {
  estimateBridgeDemo,
  estimateSwapDemo,
  runBridgeFlow,
  runBridgeWithRecovery,
  runSendFlow,
  runSwapFlow,
  runUnifiedRouteFlow,
} from "@/blockchain/appkit-service";
import { CHAINS, resolveChain } from "@/lib/chains";
import { formatUsd } from "@/lib/utils";

export type WalletContext = {
  address?: string | null;
  chainId?: number | null;
  liveBalanceUsdc?: string | null;
  forceDemo?: boolean;
};

export type ToolName =
  | "get_balances"
  | "get_wallet_state"
  | "estimate_bridge"
  | "estimate_swap"
  | "estimate_send"
  | "prepare_payment"
  | "execute_bridge"
  | "execute_swap"
  | "execute_send"
  | "execute_route"
  | "retry_bridge"
  | "generate_code"
  | "explain_arc"
  | "assess_route_risk";

export type ToolResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
  /** Money move — UI must confirm before execute_* */
  needsConfirm?: boolean;
  preview?: ActionPreview;
  transaction?: TransactionRecord;
  codeBlocks?: CodeBlock[];
};

/** OpenAI/xAI-compatible tool schemas */
export const AGENT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_balances",
      description:
        "Get multi-chain balance snapshot + live Arc wallet USDC when connected.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_wallet_state",
      description:
        "Get connected wallet address, chain id, live Arc USDC, and demo/live mode.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estimate_bridge",
      description: "Estimate cross-chain transfer fees and ETA between networks.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
        },
        required: ["amount", "fromChain", "toChain"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estimate_swap",
      description: "Estimate same-chain swap output and fees on Arc.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          tokenIn: { type: "string" },
          tokenOut: { type: "string" },
        },
        required: ["amount", "tokenIn", "tokenOut"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estimate_send",
      description: "Estimate same-chain send fee on Arc (USDC gas).",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          recipient: { type: "string" },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "prepare_payment",
      description:
        "Build a confirmable action plan (bridge/swap/send/route). Does NOT move funds.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["bridge", "swap", "send", "route"],
          },
          amount: { type: "string" },
          token: { type: "string" },
          tokenOut: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
          recipient: { type: "string" },
          recipientLabel: { type: "string" },
        },
        required: ["kind", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_bridge",
      description:
        "Execute cross-chain transfer ONLY after user confirmed. Moves USDC to the destination network.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["amount", "fromChain", "toChain", "confirmed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_swap",
      description: "Execute swap ONLY after user confirmed.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          tokenIn: { type: "string" },
          tokenOut: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["amount", "tokenIn", "tokenOut", "confirmed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_send",
      description: "Execute USDC send on Arc ONLY after user confirmed.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          recipient: { type: "string" },
          recipientLabel: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["amount", "recipient", "confirmed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_route",
      description:
        "Bridge then pay orchestration ONLY after user confirmed.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          recipient: { type: "string" },
          recipientLabel: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["amount", "recipient", "confirmed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "retry_bridge",
      description: "Retry / recover a failed cross-chain transfer step.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_code",
      description: "Generate Arc developer code snippet (send, transfer, contract).",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: [
              "bridge",
              "swap",
              "send",
              "unified",
              "component",
              "contract",
              "agent",
              "x402",
              "payroll",
              "skills",
            ],
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "explain_arc",
      description:
        "Explain Arc Network concepts (USDC gas, finality, ERC-8004, ERC-8183, x402).",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assess_route_risk",
      description:
        "x402-style route risk oracle: score a transfer route and quote micropayment fee in USDC.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
        },
        required: ["amount", "fromChain", "toChain"],
      },
    },
  },
];

const MONEY_TOOLS = new Set([
  "execute_bridge",
  "execute_swap",
  "execute_send",
  "execute_route",
]);

function asChain(v: unknown, fallback: ChainId): ChainId {
  const s = String(v || "").trim();
  if (!s) return fallback;
  if (s in CHAINS) return s as ChainId;
  // Accept aliases: "Arc", "Base", "base sepolia", etc.
  const resolved = resolveChain(s);
  if (resolved) return resolved;
  return fallback;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: {
    wallet: WalletContext;
    /** User already confirmed in UI */
    userConfirmed?: boolean;
  },
): Promise<ToolResult> {
  const preferLive = Boolean(ctx.wallet.address);

  try {
    switch (name as ToolName) {
      case "get_balances": {
        const live = ctx.wallet.liveBalanceUsdc;
        const n = Number(String(live || "0").replace(/,/g, ""));
        const amount = Number.isFinite(n) ? n : 0;
        const snap: UnifiedBalanceSnapshot = ctx.wallet.address
          ? {
              totalUsd: amount,
              balances: [
                {
                  chain: "Arc_Testnet",
                  chainLabel: "Arc Testnet",
                  token: "USDC",
                  amount,
                  usdValue: amount,
                  color: "#22d3ee",
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : emptyBalanceSnapshot();
        return {
          ok: true,
          summary: ctx.wallet.address
            ? `Live Arc balance ${amount.toFixed(4)} USDC${
                live != null ? "" : " (refresh wallet)"
              }`
            : "Connect wallet to load live Arc USDC balance",
          data: {
            ...snap,
            liveArcUsdc: live ?? (ctx.wallet.address ? String(amount) : null),
            wallet: ctx.wallet.address ?? null,
            source: ctx.wallet.address ? "live" : "none",
          },
        };
      }

      case "get_wallet_state": {
        const onArc = ctx.wallet.chainId === 5042002;
        return {
          ok: true,
          summary: ctx.wallet.address
            ? `Connected ${ctx.wallet.address.slice(0, 8)}… chain=${ctx.wallet.chainId ?? "?"} ${onArc ? "(Arc)" : ""}`
            : "No wallet — connect to execute live",
          data: {
            address: ctx.wallet.address ?? null,
            chainId: ctx.wallet.chainId ?? null,
            onArc,
            liveBalanceUsdc: ctx.wallet.liveBalanceUsdc ?? null,
            mode: "live",
            forceDemo: false,
          },
        };
      }

      case "estimate_bridge": {
        const amount = String(args.amount || "50");
        const fromChain = asChain(args.fromChain, "Base_Sepolia");
        const toChain = asChain(args.toChain, "Arc_Testnet");
        const est: BridgeEstimate = estimateBridgeDemo(
          amount,
          fromChain,
          toChain,
        );
        return {
          ok: true,
          summary: `Bridge est. ${formatUsd(est.feeUsd + est.gasUsd)} · ${est.eta} · ${est.route}`,
          data: est,
        };
      }

      case "estimate_swap": {
        const amount = String(args.amount || "50");
        const tokenIn = String(args.tokenIn || "USDC");
        const tokenOut = String(args.tokenOut || "EURC");
        const est: SwapEstimate = estimateSwapDemo(amount, tokenIn, tokenOut);
        return {
          ok: true,
          summary: `Swap est. ~${est.amountOut} ${tokenOut} · fee ${formatUsd(est.feeUsd)}`,
          data: est,
        };
      }

      case "estimate_send": {
        const amount = String(args.amount || "25");
        return {
          ok: true,
          summary: `Send ${amount} USDC on Arc · est. fee ~$0.02 (USDC gas)`,
          data: { amount, feeUsd: 0.02, eta: "<1s", chain: "Arc_Testnet" },
        };
      }

      case "prepare_payment": {
        const kind = String(args.kind || "send") as ActionPreview["type"];
        const amount = String(args.amount || "50");
        const token = String(args.token || "USDC");
        const tokenOut = String(args.tokenOut || "EURC");
        // Prefer explicit args; only default when missing (do not force Base→Arc)
        const fromChain = args.fromChain
          ? asChain(args.fromChain, "Base_Sepolia")
          : kind === "bridge"
            ? asChain(undefined, "Base_Sepolia")
            : asChain(args.fromChain, "Base_Sepolia");
        const toChain = args.toChain
          ? asChain(args.toChain, "Arc_Testnet")
          : asChain(undefined, "Arc_Testnet");
        const recipientRaw = args.recipient ? String(args.recipient) : "";
        const recipient = isValidEvmAddress(recipientRaw)
          ? recipientRaw
          : undefined;
        const recipientLabel = args.recipientLabel
          ? String(args.recipientLabel)
          : undefined;

        const preview = buildPreviewFromKind({
          kind,
          amount,
          token,
          tokenOut,
          fromChain,
          toChain,
          recipient,
          recipientLabel,
        });

        const needsAddress =
          (kind === "send" || kind === "route") && !recipient;

        return {
          ok: true,
          summary: needsAddress
            ? `Plan ready — paste a real 0x address for ${recipientLabel || "recipient"} before Confirm`
            : `Ready to confirm: ${preview.title}`,
          needsConfirm: true,
          preview,
          data: { ...preview, needsAddress },
        };
      }

      case "execute_bridge": {
        if (!gateMoney(args, ctx.userConfirmed)) {
          return blockedMoney("execute_bridge", args);
        }
        const amount = String(args.amount || "50");
        const fromChain = asChain(args.fromChain, "Base_Sepolia");
        const toChain = asChain(args.toChain, "Arc_Testnet");
        try {
          const transaction = await runBridgeFlow({
            amount,
            token: "USDC",
            fromChain,
            toChain,
            preferLive,
          });
          return {
            ok: transaction.status === "success",
            summary: `Bridge ${transaction.status} · ${transaction.executionMode}`,
            transaction,
            data: { id: transaction.id, status: transaction.status },
          };
        } catch (e) {
          return {
            ok: false,
            summary:
              e instanceof Error
                ? e.message
                : "Bridge failed — check source chain USDC and wallet network",
          };
        }
      }

      case "execute_swap": {
        if (!gateMoney(args, ctx.userConfirmed)) {
          return blockedMoney("execute_swap", args);
        }
        const transaction = await runSwapFlow({
          amount: String(args.amount || "50"),
          tokenIn: String(args.tokenIn || "USDC"),
          tokenOut: String(args.tokenOut || "EURC"),
          chain: "Arc_Testnet",
        });
        return {
          ok: transaction.status === "success",
          summary: `Swap ${transaction.status} · ${transaction.executionMode}`,
          transaction,
        };
      }

      case "execute_send": {
        if (!gateMoney(args, ctx.userConfirmed)) {
          return blockedMoney("execute_send", args);
        }
        let safeRecipient: string;
        try {
          safeRecipient = requireSafeRecipient(
            args.recipient ? String(args.recipient) : "",
            args.recipientLabel ? String(args.recipientLabel) : undefined,
          );
        } catch (e) {
          return {
            ok: false,
            summary: e instanceof Error ? e.message : "Invalid recipient",
          };
        }
        const transaction = await runSendFlow({
          amount: String(args.amount || "25"),
          token: "USDC",
          chain: "Arc_Testnet",
          recipient: safeRecipient,
          recipientLabel: args.recipientLabel
            ? String(args.recipientLabel)
            : undefined,
          preferLive,
        });
        return {
          ok: transaction.status === "success",
          summary: `Send ${transaction.status} · ${transaction.executionMode}`,
          transaction,
        };
      }

      case "execute_route": {
        if (!gateMoney(args, ctx.userConfirmed)) {
          return blockedMoney("execute_route", args);
        }
        let routeRecipient: string;
        try {
          routeRecipient = requireSafeRecipient(
            args.recipient ? String(args.recipient) : "",
            args.recipientLabel ? String(args.recipientLabel) : "recipient",
          );
        } catch (e) {
          return {
            ok: false,
            summary: e instanceof Error ? e.message : "Invalid recipient",
          };
        }
        const transaction = await runUnifiedRouteFlow({
          amount: String(args.amount || "100"),
          token: "USDC",
          fromChain: asChain(args.fromChain, "Base_Sepolia"),
          recipient: routeRecipient,
          recipientLabel: args.recipientLabel
            ? String(args.recipientLabel)
            : undefined,
        });
        return {
          ok: transaction.status === "success",
          summary: `Route ${transaction.status} · ${transaction.executionMode}`,
          transaction,
        };
      }

      case "retry_bridge": {
        const transaction = await runBridgeWithRecovery({
          amount: String(args.amount || "50"),
          fromChain: asChain(args.fromChain, "Base_Sepolia"),
          toChain: asChain(args.toChain, "Arc_Testnet"),
        });
        return {
          ok: true,
          summary: "Bridge recovery completed (retry pattern)",
          transaction,
        };
      }

      case "generate_code": {
        const topic = String(args.topic || "bridge");
        const tpl =
          CODE_TEMPLATES.find((t) => t.category === topic) || CODE_TEMPLATES[0];
        const codeBlocks: CodeBlock[] = [
          {
            language: tpl.language,
            filename: `${tpl.id}.${tpl.language === "solidity" ? "sol" : tpl.language === "tsx" ? "tsx" : "ts"}`,
            code: tpl.code,
          },
        ];
        return {
          ok: true,
          summary: `Generated ${tpl.title}`,
          codeBlocks,
          data: { id: tpl.id, title: tpl.title },
        };
      }

      case "explain_arc": {
        const topic = String(args.topic || "arc").toLowerCase();
        const blurbs: Record<string, string> = {
          arc: "Arc is Circle's open Layer-1 — the Economic OS for programmable money. USDC gas, sub-second finality, EVM-compatible. Testnet chain ID 5042002.",
          transfer:
            "Cross-chain USDC moves via approve → lock/burn → attestation → credit on Arc. AGFusion tracks each step and supports recovery.",
          bridge:
            "Cross-chain USDC moves via approve → lock/burn → attestation → credit on Arc. AGFusion tracks each step and supports recovery.",
          unified:
            "Unified balance deposits USDC from multiple networks into one spendable total for instant payouts on Arc.",
          gas: "On Arc, gas is paid in USDC (not ETH). Fees are dollar line items — budgetable for payments and agents.",
          agent:
            "Arc agentic economy: ERC-8004 identity, ERC-8183 job escrow, x402 micropayments, USDC settlement under 1s.",
          "8004":
            "ERC-8004 registers agent identity and reputation onchain. Use AGFusion Agents → ERC-8004 or docs.arc.io tutorial.",
          "8183":
            "ERC-8183 jobs: create → set budget → fund USDC escrow → submit deliverable → complete settlement on Arc.",
          x402: "x402 lets agents pay USDC micropayments for APIs (HTTP 402). Used for risk oracles and paid tools on Arc.",
          payroll:
            "Batch payroll multi-sends USDC to many recipients on Arc with per-leg USDC gas quotes.",
        };
        const hit =
          Object.entries(blurbs).find(([k]) => topic.includes(k))?.[1] ||
          blurbs.arc;
        return { ok: true, summary: hit, data: { topic, text: hit } };
      }

      case "assess_route_risk": {
        const amount = String(args.amount || "100");
        const fromChain = String(args.fromChain || "Base_Sepolia");
        const toChain = String(args.toChain || "Arc_Testnet");
        const { assessRouteRisk, createX402Receipt } = await import(
          "@/lib/agent-economy"
        );
        const { quoteX402Fee, formatUsdc } = await import("@/lib/fees");
        const receipt = createX402Receipt({
          tool: "risk_oracle",
          resource: `route:${fromChain}->${toChain}:${amount}`,
        });
        const risk = assessRouteRisk({ fromChain, toChain, amount });
        const fee = quoteX402Fee("risk_oracle");
        return {
          ok: true,
          summary: `x402 ${receipt.amountLabel} · risk ${risk.score} (${risk.level}) · ${risk.recommendation}`,
          data: {
            receipt,
            risk,
            feeUsdc: fee.totalUsdc,
            feeLabel: formatUsdc(fee.totalUsdc, 6),
          },
        };
      }

      default:
        return { ok: false, summary: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return {
      ok: false,
      summary: e instanceof Error ? e.message : "Tool failed",
    };
  }
}

function gateMoney(
  args: Record<string, unknown>,
  userConfirmed?: boolean,
): boolean {
  if (userConfirmed) return true;
  return args.confirmed === true || args.confirmed === "true";
}

function blockedMoney(
  tool: string,
  args: Record<string, unknown>,
): ToolResult {
  return {
    ok: false,
    needsConfirm: true,
    summary: `${tool} blocked until user confirms (money movement). Call prepare_payment first.`,
    data: { tool, args, blocked: true },
  };
}

function buildPreviewFromKind(p: {
  kind: string;
  amount: string;
  token: string;
  tokenOut: string;
  fromChain: ChainId;
  toChain: ChainId;
  recipient?: string;
  recipientLabel?: string;
}): ActionPreview {
  const from = CHAINS[p.fromChain];
  const to = CHAINS[p.toChain];

  if (p.kind === "bridge") {
    const est = estimateBridgeDemo(p.amount, p.fromChain, p.toChain);
    return {
      type: "bridge",
      // Explicit direction in title so UI never looks "always Base→Arc"
      title: `Bridge ${from.short} → ${to.short}`,
      summary: `Move ${p.amount} USDC from ${from.label} to ${to.label}`,
      amount: p.amount,
      token: "USDC",
      fromChain: p.fromChain,
      toChain: p.toChain,
      estimatedFeeUsd: est.feeUsd + est.gasUsd,
      estimatedTime: est.eta,
      route: [from.short, "→", to.short],
      plan: [
        { id: "src", label: `Use USDC on ${from.short}` },
        { id: "est", label: "Estimate fees", detail: formatUsd(est.feeUsd + est.gasUsd) },
        { id: "switch", label: `Wallet on ${from.short}` },
        { id: "burn", label: `Lock on ${from.short}` },
        { id: "mint", label: `Credit on ${to.short}` },
      ],
      canExecute: true,
      requiresWallet: true,
    };
  }

  if (p.kind === "swap") {
    const est = estimateSwapDemo(p.amount, p.token, p.tokenOut);
    return {
      type: "swap",
      title: `Swap ${p.token} → ${p.tokenOut}`,
      summary: `Exchange ${p.amount} ${p.token} for ~${est.amountOut} ${p.tokenOut}`,
      amount: p.amount,
      token: p.token,
      tokenOut: p.tokenOut,
      toChain: "Arc_Testnet",
      estimatedFeeUsd: est.feeUsd,
      estimatedTime: "~2s",
      route: [p.token, "FX", p.tokenOut],
      plan: [
        { id: "quote", label: "Quote", detail: `~${est.amountOut}` },
        { id: "swap", label: "Execute swap" },
      ],
      canExecute: true,
      requiresWallet: true,
    };
  }

  if (p.kind === "route") {
    return {
      type: "route",
      title: "Transfer + pay",
      summary: p.recipient
        ? `Move ${p.amount} USDC to Arc and pay ${p.recipientLabel || p.recipient}`
        : `Move ${p.amount} USDC to Arc — paste 0x address for payout`,
      amount: p.amount,
      token: "USDC",
      fromChain: p.fromChain,
      toChain: "Arc_Testnet",
      recipient: p.recipient,
      recipientLabel: p.recipientLabel,
      estimatedFeeUsd: 0.18,
      estimatedTime: "~18s",
      route: [from.short, "→", "Arc", p.recipientLabel || "Pay"],
      plan: [
        { id: "bal", label: "Read balances" },
        { id: "est", label: "Estimate route" },
        { id: "bridge", label: "Transfer to Arc" },
        {
          id: "pay",
          label: p.recipient
            ? `Pay ${p.recipientLabel || "recipient"}`
            : "Paste 0x recipient",
        },
      ],
      canExecute: Boolean(p.recipient),
      requiresWallet: true,
    };
  }

  // send default
  return {
    type: "send",
    title: p.recipientLabel ? `Pay ${p.recipientLabel}` : "Send USDC",
    summary: p.recipient
      ? `Send ${p.amount} USDC to ${p.recipientLabel || p.recipient} on Arc`
      : `Send ${p.amount} USDC — paste a full 0x address before confirm`,
    amount: p.amount,
    token: "USDC",
    toChain: "Arc_Testnet",
    recipient: p.recipient,
    recipientLabel: p.recipientLabel,
    estimatedFeeUsd: 0.02,
    estimatedTime: "<1s",
    plan: [
      { id: "bal", label: "Check Arc balance" },
      { id: "est", label: "Estimate gas (USDC)" },
      {
        id: "sign",
        label: p.recipient ? "Sign & send" : "Need 0x recipient first",
      },
    ],
    canExecute: Boolean(p.recipient),
    requiresWallet: true,
  };
}

export function isMoneyTool(name: string): boolean {
  return MONEY_TOOLS.has(name);
}
