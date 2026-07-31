/**
 * Server-only LLM provider resolution.
 *
 * Priority:
 * 1) HCNSEC (OpenAI-compatible) — https://api.hcnsec.cn
 * 2) Official Anthropic — https://api.anthropic.com (sk-ant-… only)
 * 3) BazaarLink
 * 4) xAI
 *
 * Never expose keys to the client.
 */

export type LlmProvider = "hcnsec" | "anthropic" | "bazaarlink" | "xai";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  modelFallbacks: string[];
  /** OpenAI-compatible URL; empty when using Anthropic Messages API */
  chatCompletionsUrl: string;
  /**
   * How to authenticate Anthropic-style Messages API:
   * - x-api-key: official Anthropic
   * - bearer: Bearer token
   * - both: send both headers
   */
  authStyle?: "x-api-key" | "bearer" | "both";
  extraHeaders?: Record<string, string>;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Clean base URLs pasted with comments / junk.
 */
export function normalizeBaseUrl(raw: string, fallback: string): string {
  let u = String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (
    (u.startsWith('"') && u.endsWith('"')) ||
    (u.startsWith("'") && u.endsWith("'"))
  ) {
    u = u.slice(1, -1).trim();
  }
  u = u.split(/\s*[#←]|←|—|–/i)[0]?.trim() || u;
  const m = u.match(/https?:\/\/[^\s"'<>]+/i);
  if (m) u = m[0];
  u = u.replace(/[.,;)\]]+$/g, "");
  u = stripTrailingSlash(u);
  if (!u || !/^https?:\/\//i.test(u)) return stripTrailingSlash(fallback);
  return u;
}

/**
 * Clean keys pasted into Vercel with quotes, Bearer prefix, newlines, etc.
 */
export function normalizeSecretKey(raw: string): string {
  let k = String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  k = k.replace(/^HCNSEC_API_KEY\s*=\s*/i, "");
  k = k.replace(/^OPENAI_API_KEY\s*=\s*/i, "");
  k = k.replace(/^LLM_API_KEY\s*=\s*/i, "");
  k = k.replace(/^ANTHROPIC_API_KEY\s*=\s*/i, "");
  k = k.replace(/^CLAUDE_API_KEY\s*=\s*/i, "");
  k = k.replace(/^API_KEY\s*=\s*/i, "");
  k = k.replace(/^Bearer\s+/i, "");
  k = k.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
  k = k.replace(/[\r\n\t ]+/g, "");
  if (
    !k ||
    k === '""' ||
    k === "''" ||
    /^your[-_]?/i.test(k) ||
    /^sk-xxx/i.test(k) ||
    /^<.*>$/.test(k) ||
    k.length < 8
  ) {
    return "";
  }
  return k;
}

/** Ensure OpenAI-compatible base ends with /v1 */
function withOpenAiV1(base: string): string {
  const b = stripTrailingSlash(base);
  if (/\/v1$/i.test(b)) return b;
  return `${b}/v1`;
}

const HCNSEC_DEFAULT_BASE = "https://api.hcnsec.cn";
const HCNSEC_DEFAULT_MODEL = "gpt-4o-mini";

const HCNSEC_FALLBACKS = [
  HCNSEC_DEFAULT_MODEL,
  "gpt-4o",
  "claude-3-5-sonnet",
  "gemini-2.0-flash",
];

const ANTHROPIC_FALLBACKS = [
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-latest",
  "claude-opus-4-6",
];

const BAZAARLINK_DEFAULT_MODEL = "google/gemini-2.5-flash";
const BAZAARLINK_FALLBACKS = [
  "google/gemini-2.5-flash",
  "auto:free",
  "openai/gpt-4o-mini",
];

/**
 * HCNSEC — OpenAI-compatible gateway (https://api.hcnsec.cn)
 * Chat: {base}/v1/chat/completions
 */
function buildHcnsecConfig(rawKey: string): LlmConfig | null {
  const apiKey = normalizeSecretKey(rawKey);
  if (!apiKey) return null;

  const root = normalizeBaseUrl(
    process.env.HCNSEC_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      process.env.LLM_BASE_URL ||
      HCNSEC_DEFAULT_BASE,
    HCNSEC_DEFAULT_BASE,
  );
  const baseUrl = withOpenAiV1(root);
  const model =
    process.env.HCNSEC_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    HCNSEC_DEFAULT_MODEL;

  return {
    provider: "hcnsec",
    apiKey,
    baseUrl,
    model,
    // Only primary model — avoid hanging on multi-fallback chains
    modelFallbacks: [model],
    chatCompletionsUrl: `${baseUrl}/chat/completions`,
    extraHeaders: {
      "HTTP-Referer": "https://agfusion.vercel.app",
      "X-Title": "AGFusion",
    },
  };
}

function buildAnthropicDirectConfig(rawKey: string): LlmConfig | null {
  const apiKey = normalizeSecretKey(rawKey);
  if (!apiKey) return null;
  // Official Anthropic only
  if (!apiKey.startsWith("sk-ant-")) return null;

  const baseUrl = normalizeBaseUrl(
    process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    "https://api.anthropic.com",
  );
  // Reject non-Anthropic bases (old AgentRouter leftovers)
  if (!/anthropic\.com/i.test(baseUrl)) return null;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  return {
    provider: "anthropic",
    apiKey,
    baseUrl: baseUrl.replace(/\/v1$/i, ""),
    model,
    modelFallbacks: [model, ...ANTHROPIC_FALLBACKS.filter((m) => m !== model)],
    chatCompletionsUrl: "",
    authStyle: "x-api-key",
    extraHeaders: {
      "anthropic-version": "2023-06-01",
    },
  };
}

function buildBazaarConfig(rawKey: string): LlmConfig | null {
  const apiKey = normalizeSecretKey(rawKey);
  if (!apiKey) return null;
  const baseUrl = stripTrailingSlash(
    process.env.BAZAARLINK_BASE_URL?.trim() || "https://bazaarlink.ai/api/v1",
  );
  const model =
    process.env.BAZAARLINK_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    BAZAARLINK_DEFAULT_MODEL;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();
  const referer = appUrl
    ? appUrl.startsWith("http")
      ? appUrl
      : `https://${appUrl}`
    : "https://agfusion.vercel.app";
  return {
    provider: "bazaarlink",
    apiKey,
    baseUrl,
    model,
    modelFallbacks: [
      model,
      ...BAZAARLINK_FALLBACKS.filter((m) => m !== model),
    ],
    chatCompletionsUrl: `${baseUrl}/chat/completions`,
    extraHeaders: {
      "HTTP-Referer": referer,
      "X-Title": "AGFusion",
    },
  };
}

function buildXaiConfig(rawKey: string): LlmConfig | null {
  const apiKey = normalizeSecretKey(rawKey);
  if (!apiKey) return null;
  const baseUrl = stripTrailingSlash(
    process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1",
  );
  const model =
    process.env.XAI_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "grok-4.5";
  return {
    provider: "xai",
    apiKey,
    baseUrl,
    model,
    modelFallbacks: [model],
    chatCompletionsUrl: `${baseUrl}/chat/completions`,
  };
}

/**
 * All configured providers in priority order.
 */
export function listLlmConfigs(): LlmConfig[] {
  const out: LlmConfig[] = [];
  const seen = new Set<string>();

  const pushUnique = (c: LlmConfig | null) => {
    if (!c) return;
    const id = `${c.provider}|${c.baseUrl}|${c.apiKey.slice(0, 8)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(c);
  };

  // 1) HCNSEC / OpenAI-compatible gateway
  const hcnKey =
    process.env.HCNSEC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.LLM_API_KEY ||
    "";
  pushUnique(hcnKey ? buildHcnsecConfig(hcnKey) : null);

  // 2) Official Anthropic only (sk-ant-…)
  const antKey =
    process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
  if (antKey && normalizeSecretKey(antKey).startsWith("sk-ant-")) {
    pushUnique(buildAnthropicDirectConfig(antKey));
  }

  // 3) BazaarLink
  const bRaw = process.env.BAZAARLINK_API_KEY || "";
  pushUnique(bRaw ? buildBazaarConfig(bRaw) : null);

  // 4) xAI
  const xRaw = process.env.XAI_API_KEY || "";
  pushUnique(xRaw ? buildXaiConfig(xRaw) : null);

  return out;
}

export function resolveLlmConfig(): LlmConfig | null {
  return listLlmConfigs()[0] || null;
}

export function llmConfigured(): boolean {
  return listLlmConfigs().length > 0;
}

export function llmProviderLabel(): string | null {
  const c = resolveLlmConfig();
  if (!c) return null;
  if (c.provider === "hcnsec") return `HCNSEC/${c.model}`;
  if (c.provider === "anthropic") return `Claude/${c.model}`;
  if (c.provider === "bazaarlink") return `BazaarLink/${c.model}`;
  return `xAI/${c.model}`;
}

/** Safe public diagnostics — no secrets */
export function llmPublicStatus(): {
  configured: boolean;
  provider: "hcnsec" | "claude" | "bazaarlink" | "xai" | null;
  providersAvailable: string[];
  anthropicKeyShapeOk: boolean | null;
  model: string | null;
  baseUrlHost: string | null;
  llmKeyLen: number | null;
  llmKeyPrefix: string | null;
} {
  const list = listLlmConfigs();
  const first = list[0] || null;
  const anthropic = list.find((c) => c.provider === "anthropic");
  const keySource = first;

  let baseUrlHost: string | null = null;
  if (first?.baseUrl) {
    try {
      baseUrlHost = new URL(first.baseUrl).hostname;
    } catch {
      baseUrlHost =
        first.baseUrl.replace(/^https?:\/\//i, "").split(/[/\s]/)[0] || null;
    }
  }

  const mapProvider = (
    p: LlmProvider | undefined,
  ): "hcnsec" | "claude" | "bazaarlink" | "xai" | null => {
    if (!p) return null;
    if (p === "hcnsec") return "hcnsec";
    if (p === "anthropic") return "claude";
    if (p === "bazaarlink") return "bazaarlink";
    if (p === "xai") return "xai";
    return null;
  };

  return {
    configured: list.length > 0,
    provider: mapProvider(first?.provider),
    providersAvailable: [
      ...new Set(list.map((c) => mapProvider(c.provider) || c.provider)),
    ],
    anthropicKeyShapeOk: anthropic
      ? anthropic.apiKey.startsWith("sk-ant-") && anthropic.apiKey.length > 20
      : first?.provider === "hcnsec"
        ? first.apiKey.length >= 8
        : null,
    model: first?.model ?? null,
    baseUrlHost,
    llmKeyLen: keySource?.apiKey?.length ?? null,
    llmKeyPrefix: keySource?.apiKey ? keySource.apiKey.slice(0, 4) : null,
  };
}
