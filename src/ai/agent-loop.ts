/**
 * Local agent planner: observe → estimate → confirm → act.
 * Keyword intents + clear copy. Works without an LLM key.
 */

import { parseIntent } from "@/ai/intent";
import {
  executeTool,
  type ToolResult,
  type WalletContext,
} from "@/ai/tools";
import type {
  ActionPreview,
  ChatMessage,
  CodeBlock,
  TransactionRecord,
} from "@/types";
import { formatUsd, uid } from "@/lib/utils";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "tool"; name: string; summary: string; ok: boolean }
  | { type: "confirm"; preview: ActionPreview }
  | {
      type: "message";
      content: string;
      intent?: string;
      codeBlocks?: CodeBlock[];
      actionPreview?: ActionPreview;
    }
  | { type: "transaction"; transaction: TransactionRecord }
  | { type: "done"; message: ChatMessage; transaction?: TransactionRecord };

export type AgentRunInput = {
  message: string;
  execute?: boolean;
  wallet?: WalletContext;
  onEvent?: (e: AgentEvent) => void;
};

export type AgentRunResult = {
  message: ChatMessage;
  transaction?: TransactionRecord;
  toolTrace: Array<{ name: string; summary: string; ok: boolean }>;
};

async function runTool(
  name: string,
  args: Record<string, unknown>,
  wallet: WalletContext,
  userConfirmed: boolean,
  onEvent?: (e: AgentEvent) => void,
): Promise<ToolResult> {
  onEvent?.({ type: "status", message: `Tool · ${name}…` });
  try {
    const result = await executeTool(name, args, { wallet, userConfirmed });
    onEvent?.({
      type: "tool",
      name,
      summary: result.summary,
      ok: result.ok,
    });
    return result;
  } catch (e) {
    const summary = e instanceof Error ? e.message : "Tool failed";
    onEvent?.({ type: "tool", name, summary, ok: false });
    return { ok: false, summary };
  }
}

export async function runAgentLoop(
  input: AgentRunInput,
): Promise<AgentRunResult> {
  const wallet = input.wallet || {};
  const execute = Boolean(input.execute);
  const onEvent = input.onEvent;
  const toolTrace: AgentRunResult["toolTrace"] = [];
  let transaction: TransactionRecord | undefined;
  let codeBlocks: CodeBlock[] | undefined;
  let preview: ActionPreview | undefined;

  const emitTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> => {
    const r = await runTool(name, args, wallet, execute, onEvent);
    toolTrace.push({ name, summary: r.summary, ok: r.ok });
    if (r.transaction) {
      transaction = r.transaction;
      onEvent?.({ type: "transaction", transaction: r.transaction });
    }
    if (r.codeBlocks) codeBlocks = r.codeBlocks;
    if (r.preview) preview = r.preview;
    return r;
  };

  onEvent?.({ type: "status", message: "Understanding your request…" });
  const intent = parseIntent(input.message);
  const raw = input.message.trim();
  const rawLower = raw.toLowerCase();

  const money =
    intent.type === "bridge" ||
    intent.type === "swap" ||
    intent.type === "send" ||
    intent.type === "route";

  if (money || intent.type === "balance") {
    await emitTool("get_wallet_state", {});
    await emitTool("get_balances", {});
  }

  // Risk oracle path (even when classified as explain)
  if (
    /risk|assess route|route risk|oracle|safe to (send|bridge|transfer)/i.test(
      raw,
    )
  ) {
    const amount = intent.amount || "100";
    const fromChain = intent.fromChain || "Base_Sepolia";
    const toChain = intent.toChain || "Arc_Testnet";
    const risk = await emitTool("assess_route_risk", {
      amount,
      fromChain,
      toChain,
    });
    const content = [
      "**Route risk assessment** (x402-style oracle)",
      "",
      risk.summary,
      "",
      wallet.address
        ? `Wallet connected: \`${wallet.address.slice(0, 10)}…\``
        : "Tip: connect Rabby to execute payments after reviewing risk.",
      "",
      "Next: **Send**, **Bridge**, or **Swap** when you’re ready.",
    ].join("\n");
    return finish(content, "explain", { toolTrace, onEvent });
  }

  switch (intent.type) {
    case "balance": {
      const bal = await emitTool("get_balances", {});
      const walletState = toolTrace.find((t) => t.name === "get_wallet_state");
      const content = [
        "**Your balances**",
        "",
        bal.summary,
        "",
        walletState?.summary || "",
        "",
        wallet.address
          ? "Live Arc USDC comes from your connected wallet (RPC)."
          : "Connect **Rabby** (or MetaMask) on Arc Testnet for live USDC.",
        "",
        "Try: `Swap 1 USDC to EURC` or `Bridge 5 USDC from Arc to Base`",
      ]
        .filter(Boolean)
        .join("\n");
      return finish(content, "balance", { toolTrace, onEvent });
    }

    case "code":
    case "deploy": {
      onEvent?.({ type: "status", message: "Generating Arc code…" });
      const topic = intent.codeTopic || "send";
      await emitTool("generate_code", { topic });
      const content = [
        `**Code ready** for \`${topic}\`.`,
        "",
        "Open **Studio** to copy more templates, or ask for another topic (bridge, swap, agent, x402).",
      ].join("\n");
      return finish(content, intent.type, {
        toolTrace,
        codeBlocks,
        onEvent,
      });
    }

    case "agent": {
      await emitTool("explain_arc", { topic: "agent" });
      const last = toolTrace[toolTrace.length - 1];
      const content = [
        "**Agents on Arc**",
        "",
        last?.summary ||
          "ERC-8004 identity, ERC-8183 escrow jobs, policy-bound USDC payments.",
        "",
        "Open the **Agents** page to register identity and run an ERC-8183 job.",
        "Or say: `Swap 1 USDC to EURC` to plan a payout.",
      ].join("\n");
      return finish(content, "agent", { toolTrace, onEvent });
    }

    case "explain": {
      const smallTalk =
        /^(how are you|how're you|how r u|how's it going|how is it going|what's up|whats up|sup)\b/i.test(
          rawLower,
        );
      const whoAmI =
        /^(who are you|what are you|what can you do|introduce yourself)\b/i.test(
          rawLower,
        );
      const greet =
        /^(hi|hello|hey|yo|gm|good (morning|afternoon|evening))\b/i.test(
          rawLower,
        ) ||
        /help|how (do|to)|start/i.test(rawLower);

      if (smallTalk) {
        const content = [
          "I'm doing well — thanks for asking! 👋",
          "",
          "I'm the **AGFusion** agent. I help with Arc Testnet stablecoin actions (practice money, not a bank).",
          "",
          wallet.address
            ? `Your wallet is connected (\`${wallet.address.slice(0, 8)}…\`).`
            : "Connect **Rabby** (top right) when you want live balances or sends.",
          "",
          "Try:",
          '• "Show my balances"',
          '• "Swap 1 USDC to EURC"',
          '• "Bridge 5 USDC from Arc to Base"',
          '• "What is Arc?"',
        ].join("\n");
        return finish(content, "explain", { toolTrace, onEvent });
      }

      if (whoAmI || greet) {
        const content = [
          wallet.address
            ? `Hey — wallet connected (\`${wallet.address.slice(0, 8)}…\`).`
            : "Hey — I’m the **AGFusion** agent for Arc stablecoin ops.",
          "",
          "I can:",
          "• Check balances",
          "• Plan **send / swap / bridge** (with fee estimates)",
          "• Assess route risk",
          "• Answer simple questions about Arc / this app",
          "",
          "Examples:",
          '• "Show my balances"',
          '• "Bridge 5 USDC from Arc to Base"',
          '• "Swap 5 USDC to EURC"',
          '• "How are you?" / "What is Arc?"',
          "",
          wallet.address
            ? "Money moves only after you press **Confirm & execute** and sign in your wallet."
            : "Connect **Rabby** first for live sends.",
        ].join("\n");
        return finish(content, "explain", { toolTrace, onEvent });
      }

      await emitTool("explain_arc", { topic: raw });
      const last = toolTrace[toolTrace.length - 1];
      const content = [
        last?.summary || "Arc is a stablecoin-native L1 (USDC gas, sub-second finality).",
        "",
        "Ask me to **send**, **swap**, **bridge**, or **show balances**.",
      ].join("\n");
      return finish(content, "explain", { toolTrace, onEvent });
    }

    case "bridge": {
      const amount = intent.amount || "10";
      // Never hardcode Base→Arc — honor parseIntent direction (Arc→Base etc.)
      const fromChain = intent.fromChain || "Base_Sepolia";
      const toChain = intent.toChain || "Arc_Testnet";
      // Safety: if user said "Arc to Base" but both ended up same, force from intent.raw
      let from = fromChain;
      let to = toChain;
      const rawL = intent.raw.toLowerCase();
      if (
        /\barc\b/.test(rawL) &&
        /\bbase\b/.test(rawL) &&
        /arc[\s\S]{0,24}(?:to|→|->)[\s\S]{0,12}base/.test(rawL)
      ) {
        from = "Arc_Testnet";
        to = "Base_Sepolia";
      } else if (
        /\barc\b/.test(rawL) &&
        /\bbase\b/.test(rawL) &&
        /base[\s\S]{0,24}(?:to|→|->)[\s\S]{0,12}arc/.test(rawL)
      ) {
        from = "Base_Sepolia";
        to = "Arc_Testnet";
      }

      await emitTool("estimate_bridge", {
        amount,
        fromChain: from,
        toChain: to,
      });
      const prep = await emitTool("prepare_payment", {
        kind: "bridge",
        amount,
        fromChain: from,
        toChain: to,
      });
      preview = prep.preview ?? {
        type: "bridge" as const,
        title: `Bridge ${String(from).replace(/_.*/, "")} → ${String(to).replace(/_.*/, "")}`,
        summary: `Move ${amount} USDC from ${from} to ${to}`,
        amount,
        token: "USDC",
        fromChain: from,
        toChain: to,
        estimatedFeeUsd: 0.08,
        estimatedTime: "~18s",
        canExecute: true,
        requiresWallet: true,
        plan: [
          { id: "src", label: `Switch wallet to ${from}` },
          { id: "burn", label: "Approve / burn on source" },
          { id: "mint", label: `Mint on ${to}` },
        ],
      };
      // Force preview chains in case prepare_payment defaults ever flip
      if (preview) {
        preview = {
          ...preview,
          fromChain: from,
          toChain: to,
          title: `Bridge ${String(from).includes("Arc") ? "Arc" : String(from).includes("Base") ? "Base" : from} → ${String(to).includes("Arc") ? "Arc" : String(to).includes("Base") ? "Base" : to}`,
          summary: `Move ${amount} USDC from ${from} to ${to}`,
          route: [
            String(from).includes("Arc")
              ? "Arc"
              : String(from).includes("Base")
                ? "Base"
                : String(from),
            "→",
            String(to).includes("Arc")
              ? "Arc"
              : String(to).includes("Base")
                ? "Base"
                : String(to),
          ],
        };
        onEvent?.({ type: "confirm", preview });
      }

      if (execute) {
        onEvent?.({
          type: "status",
          message: `Executing bridge ${from} → ${to} — switch network if asked…`,
        });
        const ex = await emitTool("execute_bridge", {
          amount,
          fromChain: from,
          toChain: to,
          confirmed: true,
        });
        if (!ex.ok) {
          return finish(
            [
              "**Bridge could not complete**",
              "",
              ex.summary,
              "",
              "Checklist:",
              `1. Connect **Rabby**`,
              `2. Have **USDC on ${from}** (source chain)`,
              `3. Press green **Confirm & open wallet to transfer**`,
              "4. Approve network switch + signatures in the wallet",
            ].join("\n"),
            "bridge",
            { toolTrace, preview, transaction, onEvent },
          );
        }
        return finish(successBlurb("Bridge", transaction), "bridge", {
          toolTrace,
          transaction,
          preview,
          onEvent,
        });
      }

      const fromLabel = String(from).replace(/_/g, " ");
      const toLabel = String(to).replace(/_/g, " ");
      return finish(
        [
          planBlurb("Bridge", preview, toolTrace, wallet),
          "",
          `**Direction:** ${fromLabel} → ${toLabel}`,
          `⚠️ USDC is taken from **${fromLabel}** (source). You need balance there.`,
          from === "Arc_Testnet"
            ? "Stay on Arc for the first signature; wallet may switch networks during the flow."
            : `Rabby will switch to **${fromLabel}** first, then complete the bridge.`,
          "",
          "👇 **Press Confirm & open wallet** below to start.",
        ].join("\n"),
        "bridge",
        {
          toolTrace,
          preview,
          onEvent,
        },
      );
    }

    case "swap": {
      const amount = intent.amount || "10";
      const tokenIn = intent.token || "USDC";
      const tokenOut = intent.tokenOut || "EURC";
      // "swap now" / "confirm swap" → execute in this turn
      const wantNow =
        execute ||
        /\b(now|confirm|execute|go ahead|do it|sign)\b/i.test(intent.raw);

      await emitTool("estimate_swap", { amount, tokenIn, tokenOut });
      const prep = await emitTool("prepare_payment", {
        kind: "swap",
        amount,
        token: tokenIn,
        tokenOut,
      });
      preview = prep.preview ?? {
        type: "swap" as const,
        title: `Swap ${tokenIn} → ${tokenOut}`,
        summary: `Exchange ${amount} ${tokenIn} for ${tokenOut} on Arc Testnet`,
        amount,
        token: tokenIn,
        tokenOut,
        toChain: "Arc_Testnet" as const,
        estimatedFeeUsd: 0.05,
        estimatedTime: "~2s",
        canExecute: true,
        requiresWallet: true,
        plan: [
          { id: "q", label: "Quote" },
          { id: "s", label: "Sign swap in wallet" },
        ],
      };
      if (preview) onEvent?.({ type: "confirm", preview });

      if (wantNow) {
        onEvent?.({ type: "status", message: "Executing swap — check wallet…" });
        const ex = await emitTool("execute_swap", {
          amount,
          tokenIn,
          tokenOut,
          confirmed: true,
        });
        if (!ex.ok) {
          return finish(
            [
              "**Swap could not complete**",
              "",
              ex.summary,
              "",
              "1. Save kit key in **Stablecoin FX** panel",
              "2. Connect Rabby on Arc Testnet",
              "3. Fund USDC from faucet.circle.com",
              "4. Press the green **Confirm & open wallet to swap** button on the plan card",
            ].join("\n"),
            "swap",
            { toolTrace, preview, transaction, onEvent },
          );
        }
        return finish(successBlurb("Swap", transaction), "swap", {
          toolTrace,
          transaction,
          preview,
          onEvent,
        });
      }

      return finish(
        [
          planBlurb("Swap", preview, toolTrace, wallet),
          "",
          "👇 **Press the button below** to open your wallet and complete the swap.",
        ].join("\n"),
        "swap",
        {
          toolTrace,
          preview,
          onEvent,
        },
      );
    }

    case "send": {
      const amount = intent.amount || "10";
      const recipient = intent.recipient;
      const recipientLabel = intent.recipientLabel;
      const hasAddr = Boolean(
        recipient && /^0x[a-fA-F0-9]{40}$/.test(recipient),
      );
      await emitTool("estimate_send", { amount, recipient: recipient || "" });
      const prep = await emitTool("prepare_payment", {
        kind: "send",
        amount,
        ...(hasAddr ? { recipient } : {}),
        ...(recipientLabel ? { recipientLabel } : {}),
      });
      preview = prep.preview;
      if (preview && hasAddr) onEvent?.({ type: "confirm", preview });

      if (!hasAddr) {
        return finish(
          [
            "**Payment plan**",
            "",
            `Amount: **${amount} USDC** on Arc` +
              (recipientLabel ? ` · label: ${recipientLabel}` : ""),
            "",
            "Paste a full **0x address** (42 chars) in the Payment Engine panel,",
            "or say: `Send 0.05 USDC to 0xYourAddress… on Arc`",
            "",
            "We never invent burn addresses for live sends.",
          ].join("\n"),
          "send",
          { toolTrace, preview, onEvent },
        );
      }

      if (execute) {
        if (!wallet.address) {
          return finish(
            [
              "**Cannot execute send** — no wallet connected.",
              "",
              "Click **Connect**, choose **Rabby**, switch to Arc Testnet, then Confirm again.",
            ].join("\n"),
            "send",
            { toolTrace, preview, onEvent },
          );
        }
        onEvent?.({ type: "status", message: "Waiting for wallet signature…" });
        const ex = await emitTool("execute_send", {
          amount,
          recipient,
          recipientLabel,
          confirmed: true,
        });
        if (!ex.ok) {
          return finish(
            [
              "**Send failed**",
              "",
              ex.summary,
              "",
              "Check: Arc Testnet selected · enough USDC · approve the Rabby popup.",
            ].join("\n"),
            "send",
            { toolTrace, preview, transaction, onEvent },
          );
        }
        return finish(successBlurb("Send", transaction), "send", {
          toolTrace,
          transaction,
          onEvent,
        });
      }

      return finish(planBlurb("Payment", preview, toolTrace, wallet), "send", {
        toolTrace,
        preview,
        onEvent,
      });
    }

    case "route": {
      const amount = intent.amount || "10";
      const fromChain = intent.fromChain || "Base_Sepolia";
      const recipient = intent.recipient;
      const recipientLabel = intent.recipientLabel;
      const hasAddr = Boolean(
        recipient && /^0x[a-fA-F0-9]{40}$/.test(recipient),
      );

      await emitTool("estimate_bridge", {
        amount,
        fromChain,
        toChain: "Arc_Testnet",
      });
      await emitTool("estimate_send", { amount, recipient: recipient || "" });
      const prep = await emitTool("prepare_payment", {
        kind: "route",
        amount,
        fromChain,
        ...(hasAddr ? { recipient } : {}),
        ...(recipientLabel ? { recipientLabel } : {}),
      });
      preview = prep.preview;
      if (preview && hasAddr) onEvent?.({ type: "confirm", preview });

      if (!hasAddr) {
        return finish(
          [
            "**Transfer + pay plan**",
            "",
            `Bridge ~${amount} USDC to Arc, then pay out.`,
            "",
            "Provide a real **0x recipient** before confirm — no synthetic addresses.",
          ].join("\n"),
          "route",
          { toolTrace, preview, onEvent },
        );
      }

      if (execute) {
        onEvent?.({ type: "status", message: "Executing bridge + pay…" });
        const ex = await emitTool("execute_route", {
          amount,
          fromChain,
          recipient,
          recipientLabel,
          confirmed: true,
        });
        if (!ex.ok) {
          return finish(
            [
              "**Route execution failed**",
              "",
              ex.summary,
              "",
              "Try a simpler **Send on Arc** first, or use the transfer panels.",
            ].join("\n"),
            "route",
            { toolTrace, preview, transaction, onEvent },
          );
        }
        return finish(successBlurb("Route", transaction), "route", {
          toolTrace,
          transaction,
          onEvent,
        });
      }

      return finish(
        planBlurb("Bridge + Pay", preview, toolTrace, wallet),
        "route",
        { toolTrace, preview, onEvent },
      );
    }

    default: {
      // Soft recovery: if message looks like money, re-parse hints
      if (/\d/.test(raw) && /usdc|eurc|send|pay|swap|bridge/i.test(raw)) {
        const content = [
          "I almost got that — try a clearer command:",
          "",
          '• "Bridge 5 USDC from Arc to Base"',
          '• "Swap 5 USDC to EURC"',
          '• "Bridge 20 USDC from Base to Arc"',
          '• "Show my balances"',
        ].join("\n");
        return finish(content, "unknown", { toolTrace, onEvent });
      }

      // Casual chat without LLM — still answer in a friendly way
      if (
        /how are you|how's it going|what's up|thank|thanks|cool|nice|ok|okay|great/i.test(
          rawLower,
        )
      ) {
        const content = [
          /thank|thanks/i.test(rawLower)
            ? "You're welcome!"
            : "I'm here and ready to help.",
          "",
          "I'm the AGFusion agent for **Arc Testnet** (send / swap / bridge USDC).",
          "",
          'Say something like: "Show my balances" or "Swap 1 USDC to EURC".',
        ].join("\n");
        return finish(content, "unknown", { toolTrace, onEvent });
      }

      const content = [
        "I’m the **AGFusion** agent for Arc.",
        "",
        wallet.address
          ? `Wallet: \`${wallet.address.slice(0, 10)}…\` · chain ${wallet.chainId ?? "?"}`
          : "No wallet connected yet — use **Connect** (Rabby recommended).",
        "",
        "I respond best to clear actions:",
        '• "Show my balances"',
        '• "Swap 1 USDC to EURC"',
        '• "Swap 5 USDC to EURC"',
        '• "Bridge 20 from Base to Arc"',
        '• "What is Arc?" / "How are you?" / "Help"',
        "",
        "Payments need **Confirm & execute** + wallet signature.",
      ].join("\n");
      return finish(content, "unknown", { toolTrace, onEvent });
    }
  }
}

function planBlurb(
  title: string,
  preview: ActionPreview | undefined,
  trace: AgentRunResult["toolTrace"],
  wallet: WalletContext,
): string {
  const tools = trace
    .filter((t) => t.ok)
    .map((t) => `✓ ${t.name}: ${t.summary}`)
    .join("\n");
  const failed = trace.filter((t) => !t.ok);
  return [
    `**${title} plan ready**`,
    "",
    preview?.summary || "",
    preview?.estimatedFeeUsd != null
      ? `Est. fees: **${formatUsd(preview.estimatedFeeUsd)}** (USDC gas) · ETA ${preview.estimatedTime || "—"}`
      : "",
    preview?.recipientLabel || preview?.recipient
      ? `To: **${preview.recipientLabel || preview.recipient}**`
      : "",
    "",
    wallet.address
      ? `Wallet ready: \`${wallet.address.slice(0, 10)}…\``
      : "⚠️ Connect a wallet before Confirm — live signature required.",
    "",
    tools ? `**Checks**\n${tools}` : "",
    failed.length
      ? `**Notes**\n${failed.map((f) => `• ${f.name}: ${f.summary}`).join("\n")}`
      : "",
    "",
    "No funds moved yet. Press **Confirm & execute**, then approve in **Rabby**.",
  ]
    .filter(Boolean)
    .join("\n");
}

function successBlurb(title: string, tx?: TransactionRecord): string {
  if (!tx) return `**${title}** finished.`;
  return [
    `✅ **${title} completed** · ${tx.executionMode || "live"} · **${tx.status}**`,
    "",
    `${tx.amount} ${tx.token}${tx.tokenOut ? ` → ${tx.tokenOut}` : ""}`,
    tx.recipientLabel ? `To **${tx.recipientLabel}**` : "",
    typeof tx.feeUsd === "number" ? `Fee ~ ${formatUsd(tx.feeUsd)} USDC gas` : "",
    tx.txHash ? `Tx: \`${tx.txHash}\`` : "",
    tx.explorerUrl ? `Explorer: ${tx.explorerUrl}` : "",
    tx.message || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function finish(
  content: string,
  intent: string,
  opts: {
    toolTrace: AgentRunResult["toolTrace"];
    transaction?: TransactionRecord;
    codeBlocks?: CodeBlock[];
    preview?: ActionPreview;
    onEvent?: (e: AgentEvent) => void;
  },
): AgentRunResult {
  const message: ChatMessage = {
    id: uid("msg"),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    intent: intent as ChatMessage["intent"],
    actionPreview: opts.preview,
    codeBlocks: opts.codeBlocks,
    transactionId: opts.transaction?.id,
    toolTrace: opts.toolTrace.map((t) => ({
      name: t.name,
      summary: t.summary,
      ok: t.ok,
    })),
  };

  opts.onEvent?.({
    type: "message",
    content,
    intent,
    codeBlocks: opts.codeBlocks,
    actionPreview: opts.preview,
  });
  opts.onEvent?.({
    type: "done",
    message,
    transaction: opts.transaction,
  });

  return {
    message,
    transaction: opts.transaction,
    toolTrace: opts.toolTrace,
  };
}
