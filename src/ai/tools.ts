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
  | "assess_route_risk"
  | "get_transaction_status"
  | "register_erc8004_agent";

/**
 * Resolve a same-origin API path to an absolute URL so tools work both in the
 * browser (relative fetch is fine) and in the Node runtime where relative
 * fetch URLs throw (e.g. the /api/ai/agent route).
 */
export function absoluteApiUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

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
            enum: ["bridge", "swap", "send", "route", "register_agent"],
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
        "Execute a cross-chain transfer after the user has confirmed it in the app UI. The `confirmed` field is set by the application, never by you — calling this tool does not move funds unless the app-level confirm gate has been satisfied.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          toChain: { type: "string" },
          confirmed: { type: "boolean", description: "Managed by the application. Ignore this field; you cannot set it." },
        },
        required: ["amount", "fromChain", "toChain"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_swap",
      description: "Execute a swap after the user has confirmed it in the app UI. The `confirmed` field is set by the application, never by you.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          tokenIn: { type: "string" },
          tokenOut: { type: "string" },
          confirmed: { type: "boolean", description: "Managed by the application. Ignore this field; you cannot set it." },
        },
        required: ["amount", "tokenIn", "tokenOut"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_send",
      description: "Execute a USDC send on Arc after the user has confirmed it in the app UI. The `confirmed` field is set by the application, never by you.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          recipient: { type: "string" },
          recipientLabel: { type: "string" },
          confirmed: { type: "boolean", description: "Managed by the application. Ignore this field; you cannot set it." },
        },
        required: ["amount", "recipient"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_route",
      description:
        "Bridge then pay orchestration after the user has confirmed it in the app UI. The `confirmed` field is set by the application, never by you.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string" },
          fromChain: { type: "string" },
          recipient: { type: "string" },
          recipientLabel: { type: "string" },
          confirmed: { type: "boolean", description: "Managed by the application. Ignore this field; you cannot set it." },
        },
        required: ["amount", "recipient"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "retry_bridge",
      description: "Recover a failed cross-chain transfer step, resuming from the last confirmed step. Never re-burns confirmed funds.",
      parameters: {
        type: "object",
        properties: {
          txId: {
            type: "string",
            description: "Optional id of the failed bridge transaction to recover (defaults to the most recent failed bridge).",
          },
        },
        required: [],
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
  {
    type: "function" as const,
    function: {
      name: "get_transaction_status",
      description: "Check the status of a transaction hash on ArcScan or standard RPCs.",
      parameters: {
        type: "object",
        properties: {
          txHash: { type: "string", description: "The 0x transaction hash to look up" },
        },
        required: ["txHash"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "register_erc8004_agent",
      description: "Register an agent identity on Arc after the user has confirmed it in the app UI. The `confirmed` field is set by the application, never by you.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          confirmed: { type: "boolean", description: "Managed by the application. Ignore this field; you cannot set it." },
        },
        required: ["name", "description"],
      },
    },
  },
];

const MONEY_TOOLS = new Set([
  "execute_bridge",
  "execute_swap",
  "execute_send",
  "execute_route",
  "register_erc8004_agent",
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
          summary: `Bridge indicative est. ${formatUsd(est.feeUsd + est.gasUsd)} · ${est.eta} · ${est.route} — actual fees settle on-chain`,
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
          summary: `Swap indicative est. ~${est.amountOut} ${tokenOut} · fee ${formatUsd(est.feeUsd)} — actual rate quoted on-chain`,
          data: est,
        };
      }

      case "estimate_send": {
        const amount = String(args.amount || "25");
        return {
          ok: true,
          summary: `Send ${amount} USDC on Arc · indicative est. fee ~$0.02 (USDC gas) — actual gas settles on-chain`,
          data: {
            amount,
            feeUsd: 0.02,
            eta: "~1s",
            chain: "Arc_Testnet",
            estimated: true,
            note: "Indicative estimate — actual gas settles on-chain at execution.",
          },
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
          args,
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

        // Bridge mint recipient is OPTIONAL — when omitted the SDK mints to the
        // connected wallet. But when a recipient IS supplied (e.g. via the agent /
        // tool path, which is the surface most exposed to prompt injection) it must
        // be validated the same way execute_send/execute_route are: the destination
        // mint is the irreversible half of a CCTP transfer, so a malformed, zero,
        // burn, or demo address would mean unrecoverable loss. Fail closed here.
        let bridgeRecipient: string | undefined;
        if (
          args.recipient !== undefined &&
          args.recipient !== null &&
          String(args.recipient).trim() !== ""
        ) {
          try {
            bridgeRecipient = requireSafeRecipient(
              String(args.recipient),
              args.recipientLabel
                ? String(args.recipientLabel)
                : "bridge recipient",
            );
          } catch (e) {
            return {
              ok: false,
              summary: e instanceof Error ? e.message : "Invalid recipient",
            };
          }
        }

        // Wallet-type routing guard: Circle Email Wallets can only execute Arc ↔ Base.
        try {
          const { getActiveWalletMeta } = await import("@/sdk/active-wallet");
          if (getActiveWalletMeta()?.uuid === "circle-pw") {
            const { CIRCLE_BRIDGE_CHAINS } = await import("@/lib/cctp-config");
            if (
              !CIRCLE_BRIDGE_CHAINS.includes(fromChain) ||
              !CIRCLE_BRIDGE_CHAINS.includes(toChain)
            ) {
              return {
                ok: false,
                summary: `Circle Email Wallet supports only Arc Testnet ↔ Base Sepolia. Use a browser wallet for ${fromChain} → ${toChain}.`,
              };
            }
          }
        } catch {
          /* gate is best-effort; the service layer enforces it too */
        }
        try {
          const transaction = await runBridgeFlow({
            amount,
            token: "USDC",
            fromChain,
            toChain,
            preferLive,
            recipient: bridgeRecipient,
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
        // Recover the REAL failed bridge — never a hardcoded 50 USDC Base→Arc.
        let failedTx: (TransactionRecord & { bridgeResult?: unknown }) | undefined;
        try {
          const { usePilotStore } = await import("@/store/pilot-store");
          const txs = usePilotStore.getState().transactions;
          const txId = String(args.txId || "");
          failedTx = txId
            ? (txs.find((t) => t.id === txId && t.type === "bridge") as typeof failedTx)
            : (txs.find(
                (t) => t.type === "bridge" && (t.status === "error" || t.status === "retryable"),
              ) as typeof failedTx);
        } catch {
          /* store unavailable */
        }
        if (!failedTx?.fromChain || !failedTx.toChain) {
          return {
            ok: false,
            summary: "No failed bridge transaction found to recover. Run a bridge first, or provide txId.",
          };
        }
        const transaction = await runBridgeWithRecovery({
          amount: failedTx.amount || "0",
          fromChain: failedTx.fromChain,
          toChain: failedTx.toChain,
          token: failedTx.token || "USDC",
          recipient: failedTx.recipient,
          failedTx,
          txId: failedTx.id,
        });
        return {
          ok: transaction.status === "success",
          summary: `Bridge recovery ${transaction.status} · ${transaction.fromChain} → ${transaction.toChain} · ${transaction.amount} USDC`,
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

      case "get_transaction_status": {
        // Real verification only (Phase 13) — never fabricate success.
        const txHash = String(args.txHash || "");
        if (!txHash.startsWith("0x") || txHash.length !== 66) {
          return { ok: false, summary: "Invalid transaction hash provided. Must be a 66-character hex string starting with 0x." };
        }
        try {
          // This tool runs both server-side (agent route) and in the browser —
          // a relative /api/rpc URL only works client-side, so build an
          // absolute URL from the deployment origin when on the server.
          const res = await fetch(absoluteApiUrl("/api/rpc?chain=arc"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getTransactionReceipt",
              params: [txHash],
            }),
            cache: "no-store",
          });
          const data = await res.json();
          const receipt = data?.result;
          let status: "success" | "reverted" | "pending" | "not_found";
          if (!receipt) status = "pending";
          else status = receipt.status === "0x1" ? "success" : "reverted";
          return {
            ok: true,
            summary: `Transaction ${txHash.slice(0, 10)}… status: ${status}`,
            data: {
              txHash,
              status,
              explorerUrl: `${CHAINS.Arc_Testnet.explorer}/tx/${txHash}`,
              receipt: receipt ?? null,
            },
          };
        } catch (e) {
          return {
            ok: false,
            summary: `Could not verify transaction ${txHash.slice(0, 10)}…: ${e instanceof Error ? e.message : "RPC error"}`,
          };
        }
      }

      case "register_erc8004_agent": {
        if (!gateMoney(args, ctx.userConfirmed)) {
          return blockedMoney("register_erc8004_agent", args);
        }
        const name = String(args.name || "MyAgent");
        const description = String(args.description || "An automated AI agent on Arc");

        // Real on-chain ERC-8004 IdentityRegistry.register(metadataURI) on Arc
        // Testnet — never fabricate a tx hash or success status.
        if (typeof window === "undefined") {
          return {
            ok: false,
            summary:
              "ERC-8004 registration must run in the browser with your connected wallet. Press Confirm on the plan card to open your wallet and sign.",
          };
        }
        try {
          const { registerErc8004Agent } = await import("@/lib/erc8004");
          const result = await registerErc8004Agent();
          const transaction: TransactionRecord = {
            id: `tx_${Math.random().toString(36).slice(2, 11)}`,
            type: "deploy",
            status: "success",
            amount: "0",
            token: "USDC",
            fromChain: "Arc_Testnet",
            toChain: "Arc_Testnet",
            feeUsd: 0.05,
            steps: [
              { name: "Prepare Payload", state: "success" },
              {
                name: "Sign & Execute",
                state: "success",
                txHash: result.txHash,
              },
            ],
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            createdAt: new Date().toISOString(),
            message: `Registered Agent: ${name} (${description})`,
            executionMode: "live",
          };
          return {
            ok: true,
            summary: `ERC-8004 Agent '${name}' registered on Arc Testnet · tx ${result.txHash.slice(0, 10)}…`,
            transaction,
            data: result,
          };
        } catch (e) {
          return {
            ok: false,
            summary:
              e instanceof Error
                ? e.message
                : "ERC-8004 registration failed — connect a wallet on Arc Testnet and try again.",
          };
        }
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

/** @internal exported for authorization tests. */
export function gateMoney(
  args: Record<string, unknown>,
  userConfirmed?: boolean,
): boolean {
  // Only trusted application-level confirmation authorizes money movement.
  // `args.confirmed` — which could be produced by the LLM itself or a prompt
  // injection — is deliberately ignored. The LLM may prepare an action, but
  // it can never authorize execution.
  void args;
  return userConfirmed === true;
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
  args?: Record<string, unknown>;
}): ActionPreview {
  const from = CHAINS[p.fromChain];
  const to = CHAINS[p.toChain];

  if (p.kind === "register_agent") {
    const name = String(p.args?.name || "MyAgent");
    const description = String(p.args?.description || "An automated AI agent on Arc");
    return {
      type: "deploy",
      title: `Register ERC-8004 Agent`,
      summary: `Register agent '${name}' on Arc Testnet. Gas will be paid in USDC.`,
      amount: "0",
      token: "USDC",
      fromChain: "Arc_Testnet",
      toChain: "Arc_Testnet",
      estimatedFeeUsd: 0.05,
      estimatedTime: "~1s",
      route: ["Arc", "→", "ERC-8004 Registry"],
      plan: [
        { id: "prep", label: "Prepare Payload", detail: `Agent: ${name}` },
        { id: "exec", label: "Execute Registration" },
      ],
      canExecute: true,
      requiresWallet: true,
    };
  }

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
