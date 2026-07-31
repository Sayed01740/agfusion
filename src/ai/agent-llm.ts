/**
 * Optional LLM tool-calling loop (Claude / BazaarLink / xAI).
 * Falls back to local agent-loop when no key or on failure.
 */

import {
  AGENT_TOOL_DEFINITIONS,
  executeTool,
  isMoneyTool,
  type WalletContext,
} from "@/ai/tools";
import { runAgentLoop, type AgentEvent, type AgentRunResult } from "@/ai/agent-loop";
import { parseIntent } from "@/ai/intent";
import type { ActionPreview, ChatMessage, CodeBlock, TransactionRecord } from "@/types";
import {
  listLlmConfigs,
  resolveLlmConfig,
  type LlmConfig,
} from "@/lib/llm-config";
import {
  AGENT_SYSTEM,
  anthropicMessages,
  type ClaudeMessage,
} from "@/lib/claude-client";
import { uid } from "@/lib/utils";

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

/** Status codes where trying another model may help */
function shouldTryNextModel(status: number): boolean {
  return (
    status === 402 ||
    status === 403 ||
    status === 404 ||
    status === 410 ||
    status === 429 ||
    status === 503
  );
}

async function chatCompletionsOpenAi(
  llm: LlmConfig,
  model: string,
  messages: ChatMsg[],
  opts?: { withTools?: boolean; timeoutMs?: number },
): Promise<
  | { ok: true; message: ChatMsg & { tool_calls?: ChatMsg["tool_calls"] } }
  | { ok: false; status: number; body: string }
> {
  const withTools = opts?.withTools !== false;
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const body: Record<string, unknown> = {
    model,
    temperature: 0.3,
    messages,
  };
  if (withTools) {
    body.tools = AGENT_TOOL_DEFINITIONS;
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(llm.chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
        ...(llm.extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { ok: false, status: 504, body: msg.slice(0, 200) };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { ok: false, status: res.status, body: errBody.slice(0, 300) };
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  if (!choice) {
    return { ok: false, status: 502, body: "empty_choice" };
  }
  return { ok: true, message: choice };
}

async function runAnthropicAgentLoop(input: {
  message: string;
  execute?: boolean;
  wallet?: WalletContext;
  onEvent?: (e: AgentEvent) => void;
  llm: LlmConfig;
}): Promise<AgentRunResult | null> {
  const { llm } = input;
  const wallet = input.wallet || {};
  const execute = Boolean(input.execute);
  const onEvent = input.onEvent;
  const toolTrace: AgentRunResult["toolTrace"] = [];
  let transaction: TransactionRecord | undefined;
  let codeBlocks: CodeBlock[] | undefined;
  let preview: ActionPreview | undefined;

  const walletNote = `Wallet context: ${JSON.stringify({
    address: wallet.address ?? null,
    chainId: wallet.chainId ?? null,
    liveBalanceUsdc: wallet.liveBalanceUsdc ?? null,
    userConfirmedExecute: execute,
  })}`;

  const userText = execute
    ? `${input.message}\n\n[USER CONFIRMED EXECUTE — you may set confirmed=true on execute_* tools]\n${walletNote}`
    : `${input.message}\n\n[DO NOT execute money tools yet — plan or answer only]\n${walletNote}`;

  const messages: ClaudeMessage[] = [{ role: "user", content: userText }];

  let activeModel = llm.model;
  const models = llm.modelFallbacks?.length
    ? llm.modelFallbacks
    : [llm.model];

  try {
    for (let round = 0; round < 6; round++) {
      onEvent?.({
        type: "status",
        message: `Claude reasoning (${activeModel}, round ${round + 1})…`,
      });

      let lastErr = "";
      let response: Awaited<ReturnType<typeof anthropicMessages>> | null = null;

      const tryModels =
        round === 0
          ? models
          : [activeModel, ...models.filter((m) => m !== activeModel)];

      for (const model of tryModels) {
        const result = await anthropicMessages(llm, {
          model,
          system: AGENT_SYSTEM,
          messages,
          withTools: true,
          temperature: 0.3,
          maxTokens: 4096,
        });
        if (result.ok) {
          activeModel = model;
          response = result;
          break;
        }
        lastErr = `${result.status} ${result.body}`;
        console.warn(
          `[agent-llm] anthropic model=${model}`,
          result.status,
          result.body,
        );
        if (result.status === 401) return null;
        if (!shouldTryNextModel(result.status) && round > 0) break;
        onEvent?.({
          type: "status",
          message: `Model ${model} unavailable (${result.status}) — trying next…`,
        });
      }

      if (!response || !response.ok) {
        console.warn("[agent-llm] anthropic all models failed", lastErr);
        return null;
      }

      if (!response.toolUses.length) {
        const text = response.text || "Done.";
        const message: ChatMessage = {
          id: uid("msg"),
          role: "assistant",
          content: text,
          createdAt: new Date().toISOString(),
          actionPreview: preview,
          codeBlocks,
          transactionId: transaction?.id,
        };
        onEvent?.({
          type: "message",
          content: text,
          actionPreview: preview,
          codeBlocks,
        });
        if (transaction) {
          onEvent?.({ type: "transaction", transaction });
        }
        onEvent?.({ type: "done", message, transaction });
        return { message, transaction, toolTrace };
      }

      // Assistant turn with tool_use blocks
      messages.push({
        role: "assistant",
        content: response.rawContent,
      });

      const toolResults: ClaudeMessage["content"] = [];

      for (const call of response.toolUses) {
        const name = call.name;
        const args: Record<string, unknown> = { ...call.input };

        if (isMoneyTool(name) && !execute) {
          args.confirmed = false;
        }
        if (isMoneyTool(name) && execute) {
          args.confirmed = true;
        }

        onEvent?.({ type: "status", message: `Tool · ${name}…` });
        const result = await executeTool(name, args, {
          wallet,
          userConfirmed: execute,
        });

        toolTrace.push({ name, summary: result.summary, ok: result.ok });
        onEvent?.({
          type: "tool",
          name,
          summary: result.summary,
          ok: result.ok,
        });

        if (result.preview) {
          preview = result.preview;
          onEvent?.({ type: "confirm", preview: result.preview });
        }
        if (result.transaction) {
          transaction = result.transaction;
          onEvent?.({ type: "transaction", transaction: result.transaction });
        }
        if (result.codeBlocks) codeBlocks = result.codeBlocks;

        (toolResults as Array<Record<string, unknown>>).push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify({
            ok: result.ok,
            summary: result.summary,
            needsConfirm: result.needsConfirm,
            data: result.data,
            hasTransaction: Boolean(result.transaction),
            hasCode: Boolean(result.codeBlocks?.length),
          }),
          is_error: !result.ok,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    const message: ChatMessage = {
      id: uid("msg"),
      role: "assistant",
      content: preview
        ? "Plan ready after tool budget. Confirm to execute."
        : "Agent reached tool limit. Try a more specific command.",
      createdAt: new Date().toISOString(),
      actionPreview: preview,
      codeBlocks,
      transactionId: transaction?.id,
    };
    onEvent?.({ type: "done", message, transaction });
    return { message, transaction, toolTrace };
  } catch (e) {
    console.warn("[agent-llm] anthropic failed", e);
    return null;
  }
}

async function runOpenAiCompatAgentLoop(input: {
  message: string;
  execute?: boolean;
  wallet?: WalletContext;
  onEvent?: (e: AgentEvent) => void;
  llm: LlmConfig;
}): Promise<AgentRunResult | null> {
  const { llm } = input;
  const wallet = input.wallet || {};
  const execute = Boolean(input.execute);
  const onEvent = input.onEvent;
  const toolTrace: AgentRunResult["toolTrace"] = [];
  let transaction: TransactionRecord | undefined;
  let codeBlocks: CodeBlock[] | undefined;
  let preview: ActionPreview | undefined;

  const walletNote = `Wallet context: ${JSON.stringify({
    address: wallet.address ?? null,
    chainId: wallet.chainId ?? null,
    liveBalanceUsdc: wallet.liveBalanceUsdc ?? null,
    forceDemo: wallet.forceDemo ?? false,
    userConfirmedExecute: execute,
  })}`;

  const messages: ChatMsg[] = [
    { role: "system", content: AGENT_SYSTEM },
    {
      role: "user",
      content: execute
        ? `${input.message}\n\n[USER CONFIRMED EXECUTE — you may set confirmed=true on execute_* tools]\n${walletNote}`
        : `${input.message}\n\n[DO NOT execute money tools yet — plan or answer only]\n${walletNote}`,
    },
  ];

  let activeModel = llm.model;
  // Prefer primary model only — long fallback chains hang on slow gateways
  const models = [llm.model];

  try {
    for (let round = 0; round < 6; round++) {
      onEvent?.({
        type: "status",
        message: `Agent reasoning (${llm.provider}/${activeModel}, round ${round + 1})…`,
      });

      let choice: (ChatMsg & { tool_calls?: ChatMsg["tool_calls"] }) | null =
        null;
      let lastErr = "";

      for (const model of models) {
        // Try with tools first; if gateway hangs/fails, retry without tools
        let result = await chatCompletionsOpenAi(llm, model, messages, {
          withTools: true,
          timeoutMs: 40_000,
        });
        if (!result.ok && (result.status === 504 || result.status >= 500)) {
          onEvent?.({
            type: "status",
            message: "Retrying without tools…",
          });
          result = await chatCompletionsOpenAi(llm, model, messages, {
            withTools: false,
            timeoutMs: 40_000,
          });
        }
        if (result.ok) {
          activeModel = model;
          choice = result.message;
          break;
        }
        lastErr = `${result.status} ${result.body}`;
        console.warn(
          `[agent-llm] ${llm.provider} model=${model} error`,
          result.status,
          result.body,
        );
        if (result.status === 401) return null;
        if (!shouldTryNextModel(result.status) && result.status !== 504) {
          break;
        }
        onEvent?.({
          type: "status",
          message: `Model ${model} unavailable (${result.status}) — trying next…`,
        });
      }

      if (!choice) {
        console.warn("[agent-llm] all models failed", lastErr);
        return null;
      }

      const toolCalls = choice.tool_calls as ChatMsg["tool_calls"];

      if (!toolCalls?.length) {
        const text =
          typeof choice.content === "string" && choice.content.trim()
            ? choice.content
            : "Done.";

        const message: ChatMessage = {
          id: uid("msg"),
          role: "assistant",
          content: text,
          createdAt: new Date().toISOString(),
          actionPreview: preview,
          codeBlocks,
          transactionId: transaction?.id,
        };

        onEvent?.({
          type: "message",
          content: text,
          actionPreview: preview,
          codeBlocks,
        });
        if (transaction) {
          onEvent?.({ type: "transaction", transaction });
        }
        onEvent?.({ type: "done", message, transaction });

        return { message, transaction, toolTrace };
      }

      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        if (isMoneyTool(name) && !execute) {
          args.confirmed = false;
        }
        if (isMoneyTool(name) && execute) {
          args.confirmed = true;
        }

        onEvent?.({ type: "status", message: `Tool · ${name}…` });
        const result = await executeTool(name, args, {
          wallet,
          userConfirmed: execute,
        });

        toolTrace.push({ name, summary: result.summary, ok: result.ok });
        onEvent?.({
          type: "tool",
          name,
          summary: result.summary,
          ok: result.ok,
        });

        if (result.preview) {
          preview = result.preview;
          onEvent?.({ type: "confirm", preview: result.preview });
        }
        if (result.transaction) {
          transaction = result.transaction;
          onEvent?.({ type: "transaction", transaction: result.transaction });
        }
        if (result.codeBlocks) codeBlocks = result.codeBlocks;

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify({
            ok: result.ok,
            summary: result.summary,
            needsConfirm: result.needsConfirm,
            data: result.data,
            hasTransaction: Boolean(result.transaction),
            hasCode: Boolean(result.codeBlocks?.length),
          }),
        });
      }
    }

    const message: ChatMessage = {
      id: uid("msg"),
      role: "assistant",
      content: preview
        ? "Plan ready after tool budget. Confirm to execute."
        : "Agent reached tool limit. Try a more specific command.",
      createdAt: new Date().toISOString(),
      actionPreview: preview,
      codeBlocks,
      transactionId: transaction?.id,
    };
    onEvent?.({ type: "done", message, transaction });
    return { message, transaction, toolTrace };
  } catch (e) {
    console.warn("[agent-llm] openai-compat failed", e);
    return null;
  }
}

export async function runLlmAgentLoop(input: {
  message: string;
  execute?: boolean;
  wallet?: WalletContext;
  onEvent?: (e: AgentEvent) => void;
}): Promise<AgentRunResult | null> {
  const providers = listLlmConfigs();
  if (!providers.length) return null;

  // Try HCNSEC / OpenAI-compat first, then Anthropic Messages, then others
  for (const llm of providers) {
    const usesMessagesApi = llm.provider === "anthropic";

    input.onEvent?.({
      type: "status",
      message:
        llm.provider === "hcnsec"
          ? `Using HCNSEC · ${llm.model}…`
          : llm.provider === "anthropic"
            ? `Using Claude (${llm.model})…`
            : `Using ${llm.provider} (${llm.model})…`,
    });

    const result = usesMessagesApi
      ? await runAnthropicAgentLoop({ ...input, llm })
      : await runOpenAiCompatAgentLoop({ ...input, llm });

    if (result) return result;

    console.warn(
      `[agent-llm] provider ${llm.provider} failed — trying next if available`,
    );
    input.onEvent?.({
      type: "status",
      message:
        llm.provider === "hcnsec"
          ? "HCNSEC unavailable — trying fallback LLM…"
          : llm.provider === "anthropic"
            ? "Claude unavailable — trying fallback LLM…"
            : `${llm.provider} failed — trying next…`,
    });
  }

  return null;
}

const MONEY_INTENTS = new Set(["swap", "send", "bridge", "route"]);

function isMoneyCommand(message: string): boolean {
  try {
    return MONEY_INTENTS.has(parseIntent(message).type);
  } catch {
    return /\b(swap|bridge|send|pay|transfer|convert)\b/i.test(message);
  }
}

/**
 * Prefer LLM for natural language.
 * Money commands ALWAYS get a Confirm card (actionPreview).
 */
export async function runSmartAgent(input: {
  message: string;
  execute?: boolean;
  wallet?: WalletContext;
  onEvent?: (e: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const money = !input.execute && isMoneyCommand(input.message);

  if (money) {
    input.onEvent?.({
      type: "status",
      message: "Building payment plan (estimate → confirm card)…",
    });
    const local = await runAgentLoop(input);

    if (local.message.actionPreview) {
      try {
        const llm = await runLlmAgentLoop({
          ...input,
          message: `${input.message}\n\n[Internal: a confirm card was already built. Write a short helpful plan summary for the user. Do not invent tx hashes. Mention they must press Confirm & open wallet to sign.]`,
        });
        if (llm?.message?.content) {
          const content = llm.message.content.trim();
          const message = {
            ...local.message,
            content:
              content ||
              local.message.content ||
              "Plan ready. Press **Confirm & open wallet** to sign.",
            actionPreview: local.message.actionPreview,
            toolTrace: [
              ...(local.toolTrace || []),
              ...(llm.toolTrace || []),
            ],
          };
          input.onEvent?.({
            type: "message",
            content: message.content,
            actionPreview: message.actionPreview,
          });
          input.onEvent?.({
            type: "confirm",
            preview: message.actionPreview!,
          });
          input.onEvent?.({
            type: "done",
            message,
            transaction: local.transaction,
          });
          return {
            message,
            transaction: local.transaction,
            toolTrace: message.toolTrace || local.toolTrace,
          };
        }
      } catch {
        /* keep local */
      }
      return local;
    }

    const llm = await runLlmAgentLoop(input);
    if (llm?.message.actionPreview) return llm;
    return local;
  }

  // Chat / help / balances: HCNSEC / Claude first
  const llm = await runLlmAgentLoop(input);
  if (llm) {
    if (!llm.message.actionPreview && isMoneyCommand(input.message)) {
      input.onEvent?.({
        type: "status",
        message: "Adding confirm card…",
      });
      const local = await runAgentLoop(input);
      if (local.message.actionPreview) {
        return {
          message: {
            ...llm.message,
            actionPreview: local.message.actionPreview,
            content:
              llm.message.content ||
              local.message.content ||
              "Plan ready. Confirm to open wallet.",
          },
          transaction: local.transaction,
          toolTrace: [
            ...(llm.toolTrace || []),
            ...(local.toolTrace || []),
          ],
        };
      }
    }
    return llm;
  }

  input.onEvent?.({
    type: "status",
    message: "Using built-in agent (smart AI offline)…",
  });
  const local = await runAgentLoop(input);
  // Soft notice only for money-style turns (don't spam casual chat)
  if (local.message?.content && !input.execute && isMoneyCommand(input.message)) {
    const note =
      "\n\n---\n_Using built-in agent (smart LLM offline). " +
      "Confirm → wallet sign still works. " +
      "Owner: fix `HCNSEC_MODEL` to a model your API key can access on https://api.hcnsec.cn/_";
    local.message = {
      ...local.message,
      content: `${local.message.content}${note}`,
    };
  }
  return local;
}
