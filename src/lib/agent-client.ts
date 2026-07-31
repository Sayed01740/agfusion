/**
 * Browser client for the AGFusion agent.
 *
 * Plan: server (BazaarLink) + always attach a Confirm card for money commands.
 * Execute: local only so Rabby/MetaMask can open for signatures.
 */

import type { ActionPreview, ChatMessage, TransactionRecord } from "@/types";
import type { WalletContext } from "@/ai/tools";
import { runAgentLoop } from "@/ai/agent-loop";
import { parseIntent } from "@/ai/intent";

export type AgentStreamHandlers = {
  onStatus?: (message: string) => void;
  onTool?: (name: string, summary: string, ok: boolean) => void;
  onConfirm?: (preview: ActionPreview) => void;
  onMessage?: (content: string, preview?: ActionPreview) => void;
  onTransaction?: (tx: TransactionRecord) => void;
  onDone?: (message: ChatMessage, transaction?: TransactionRecord) => void;
  onError?: (message: string) => void;
};

const MONEY = new Set(["swap", "send", "bridge", "route"]);

function isMoneyCommand(message: string): boolean {
  try {
    return MONEY.has(parseIntent(message).type);
  } catch {
    return /\b(swap|bridge|send|pay|transfer|convert)\b/i.test(message);
  }
}

/**
 * Plan via server when possible; money always ends with a Confirm card.
 * Execute always runs in the browser (wallet signature).
 */
export async function runAgentStream(opts: {
  message: string;
  execute?: boolean;
  confirmed?: boolean;
  wallet?: WalletContext;
  handlers: AgentStreamHandlers;
}): Promise<{ message?: ChatMessage; transaction?: TransactionRecord }> {
  const willExecute = Boolean(opts.execute && (opts.confirmed ?? opts.execute));

  // Wallet signatures only work in the browser (window.ethereum / App Kit)
  if (willExecute) {
    return runLocal(opts);
  }

  const money = isMoneyCommand(opts.message);

  // Money commands: prefer local planner for a reliable Confirm card, then
  // still try server for nicer copy if local already has the preview.
  if (money) {
    opts.handlers.onStatus?.(
      "Building plan — you will confirm before any wallet signature…",
    );
    const local = await runLocal(opts);
    if (local.message?.actionPreview) {
      // Local already fired onDone with Confirm card — good.
      return local;
    }
    // Rare: local failed — try server
    try {
      const serverResult = await runServerAgent(opts);
      if (serverResult?.message) return serverResult;
    } catch {
      /* keep local */
    }
    return local;
  }

  // Chat / explain / balances: server LLM first
  try {
    const serverResult = await runServerAgent(opts);
    if (serverResult?.message) {
      // Safety: money phrasing without preview → attach local plan card
      if (
        isMoneyCommand(opts.message) &&
        !serverResult.message.actionPreview
      ) {
        opts.handlers.onStatus?.("Adding Confirm & open wallet card…");
        const local = await runLocalSilent(opts);
        if (local?.actionPreview) {
          const merged: ChatMessage = {
            ...serverResult.message,
            actionPreview: local.actionPreview,
            content: `${serverResult.message.content}\n\nPress **Confirm & open wallet** below to sign.`.trim(),
          };
          opts.handlers.onConfirm?.(local.actionPreview);
          opts.handlers.onDone?.(merged);
          return { message: merged };
        }
      }
      return serverResult;
    }
  } catch (e) {
    console.warn("[AGFusion] server agent failed, using local", e);
  }

  return runLocal(opts);
}

/** Local loop without double-firing handlers for merge cases */
async function runLocalSilent(opts: {
  message: string;
  wallet?: WalletContext;
}): Promise<ChatMessage | null> {
  try {
    const result = await runAgentLoop({
      message: opts.message,
      execute: false,
      wallet: {
        address: opts.wallet?.address ?? null,
        chainId: opts.wallet?.chainId ?? null,
        liveBalanceUsdc: opts.wallet?.liveBalanceUsdc ?? null,
        forceDemo: false,
      },
    });
    return result.message || null;
  } catch {
    return null;
  }
}

async function runServerAgent(opts: {
  message: string;
  execute?: boolean;
  confirmed?: boolean;
  wallet?: WalletContext;
  handlers: AgentStreamHandlers;
}): Promise<{ message?: ChatMessage; transaction?: TransactionRecord } | null> {
  const { handlers } = opts;
  handlers.onStatus?.("Connecting smart agent…");

  const res = await fetch("/api/ai/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: opts.message,
      execute: false,
      confirmed: false,
      wallet: {
        address: opts.wallet?.address ?? null,
        chainId: opts.wallet?.chainId ?? null,
        liveBalanceUsdc: opts.wallet?.liveBalanceUsdc ?? null,
        forceDemo: false,
      },
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    return null;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: ChatMessage | undefined;
  let finalTx: TransactionRecord | undefined;
  let lastContent = "";
  let pendingPreview: ActionPreview | undefined;
  let gotAny = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      gotAny = true;
      const type = String(event.type || "");

      if (type === "status" && typeof event.message === "string") {
        handlers.onStatus?.(event.message);
      }
      if (type === "tool" && typeof event.name === "string") {
        handlers.onTool?.(
          event.name,
          typeof event.summary === "string" ? event.summary : "",
          Boolean(event.ok),
        );
      }
      if (type === "confirm" && event.preview) {
        pendingPreview = event.preview as ActionPreview;
        handlers.onConfirm?.(pendingPreview);
      }
      if (type === "message") {
        const content =
          typeof event.content === "string" ? event.content : "";
        lastContent = content;
        if (event.actionPreview) {
          pendingPreview = event.actionPreview as ActionPreview;
        }
        handlers.onMessage?.(content, pendingPreview);
      }
      if (type === "transaction" && event.transaction) {
        finalTx = event.transaction as TransactionRecord;
        handlers.onTransaction?.(finalTx);
      }
      if (type === "done") {
        if (event.message) {
          finalMessage = event.message as ChatMessage;
          if (pendingPreview && !finalMessage.actionPreview) {
            finalMessage = {
              ...finalMessage,
              actionPreview: pendingPreview,
            };
          }
        }
        if (event.transaction) {
          finalTx = event.transaction as TransactionRecord;
        }
        if (finalMessage) {
          handlers.onDone?.(finalMessage, finalTx);
        }
      }
      if (type === "error") {
        return null;
      }
    }
  }

  if (!gotAny) return null;

  if (!finalMessage && lastContent) {
    finalMessage = {
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: lastContent,
      createdAt: new Date().toISOString(),
      actionPreview: pendingPreview,
    };
    handlers.onDone?.(finalMessage, finalTx);
  }

  return finalMessage
    ? { message: finalMessage, transaction: finalTx }
    : null;
}

async function runLocal(opts: {
  message: string;
  execute?: boolean;
  confirmed?: boolean;
  wallet?: WalletContext;
  handlers: AgentStreamHandlers;
}): Promise<{ message?: ChatMessage; transaction?: TransactionRecord }> {
  const { handlers } = opts;
  handlers.onStatus?.("Agent online…");

  try {
    let doneFired = false;
    const result = await runAgentLoop({
      message: opts.message,
      execute: Boolean(opts.execute && (opts.confirmed ?? opts.execute)),
      wallet: {
        address: opts.wallet?.address ?? null,
        chainId: opts.wallet?.chainId ?? null,
        liveBalanceUsdc: opts.wallet?.liveBalanceUsdc ?? null,
        forceDemo: false,
      },
      onEvent: (e) => {
        try {
          if (e.type === "status") handlers.onStatus?.(e.message);
          if (e.type === "tool")
            handlers.onTool?.(e.name, e.summary, e.ok);
          if (e.type === "confirm") handlers.onConfirm?.(e.preview);
          if (e.type === "message")
            handlers.onMessage?.(e.content, e.actionPreview);
          if (e.type === "transaction")
            handlers.onTransaction?.(e.transaction);
          if (e.type === "done") {
            doneFired = true;
            handlers.onDone?.(e.message, e.transaction);
          }
        } catch (handlerErr) {
          console.warn("[AGFusion] agent handler error", handlerErr);
        }
      },
    });

    if (!doneFired && result?.message) {
      handlers.onDone?.(result.message, result.transaction);
    }

    if (!result?.message) {
      const fallback = {
        id: `msg_${Date.now()}`,
        role: "assistant" as const,
        content:
          "I could not build a response. Try **Help** or **Show my balances**.",
        createdAt: new Date().toISOString(),
      };
      handlers.onDone?.(fallback);
      return { message: fallback };
    }

    return { message: result.message, transaction: result.transaction };
  } catch (e) {
    console.error("[AGFusion] agent loop error", e);
    const msg =
      e instanceof Error ? e.message : "Agent failed — try a simpler command";
    handlers.onError?.(msg);
    return {};
  }
}
