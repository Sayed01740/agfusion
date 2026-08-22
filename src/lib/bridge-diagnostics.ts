"use client";

export type BridgeDiagnosticLevel = "info" | "success" | "warning" | "error" | "fatal";

export interface BridgeDiagnosticEvent {
  id: string;
  sequence: number;
  timestamp: string;
  level: BridgeDiagnosticLevel;
  stage: string;
  message: string;
  method?: string;
  chainId?: string;
  txHash?: string;
  durationMs?: number;
  data?: unknown;
  error?: {
    name?: string;
    message?: string;
    code?: string | number;
    stack?: string;
    cause?: unknown;
  };
}

export interface BridgeDiagnosticSession {
  version: 3;
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  app: "AGFusion";
  purpose: "Circle CCTP bridge diagnostic log";
  context: Record<string, unknown>;
  events: BridgeDiagnosticEvent[];
}

const STORAGE_KEY = "agfusion.bridge.diagnostics.v3";
const MAX_EVENTS = 500;

function safe(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max-depth]";
  if (value === undefined || value === null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: safe((value as Error & { cause?: unknown }).cause, depth + 1),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => safe(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (/private|secret|seed|mnemonic|password|token|authorization|cookie|api[_-]?key/.test(lower)) {
        out[key] = "[redacted]";
      } else {
        out[key] = safe(val, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function load(): BridgeDiagnosticSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BridgeDiagnosticSession) : null;
  } catch {
    return null;
  }
}

function save(session: BridgeDiagnosticSession) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Diagnostics must never break the bridge itself.
  }
}

export function startBridgeDiagnostic(context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return "";
  const now = new Date().toISOString();
  const session: BridgeDiagnosticSession = {
    version: 3,
    sessionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    startedAt: now,
    updatedAt: now,
    app: "AGFusion",
    purpose: "Circle CCTP bridge diagnostic log",
    context: safe(context) as Record<string, unknown>,
    events: [],
  };
  save(session);
  appendBridgeDiagnostic("info", "BRIDGE_STARTED", "Bridge diagnostic session started", { data: context });
  return session.sessionId;
}

export function appendBridgeDiagnostic(
  level: BridgeDiagnosticLevel,
  stage: string,
  message: string,
  options: {
    method?: string;
    chainId?: string | number;
    txHash?: string;
    durationMs?: number;
    data?: unknown;
    error?: unknown;
  } = {},
) {
  if (typeof window === "undefined") return;
  const session = load();
  if (!session) return;
  const rawError = options.error;
  const normalizedError = rawError
    ? (() => {
        const e = safe(rawError) as Record<string, unknown>;
        return {
          name: typeof e?.name === "string" ? e.name : undefined,
          message: typeof e?.message === "string" ? e.message : undefined,
          code: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
          stack: typeof e?.stack === "string" ? e.stack : undefined,
          cause: e?.cause,
        };
      })()
    : undefined;

  const event: BridgeDiagnosticEvent = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    sequence: session.events.length + 1,
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    method: options.method,
    chainId: options.chainId === undefined ? undefined : String(options.chainId),
    txHash: options.txHash,
    durationMs: options.durationMs,
    data: safe(options.data),
    error: normalizedError,
  };

  session.events.push(event);
  if (session.events.length > MAX_EVENTS) session.events = session.events.slice(-MAX_EVENTS);
  session.updatedAt = event.timestamp;
  save(session);
}

export async function captureProviderRequest<T>(
  method: string,
  params: unknown,
  fn: () => Promise<T>,
  context: { stage?: string; chainId?: string | number } = {},
): Promise<T> {
  const started = performance.now();
  appendBridgeDiagnostic("info", "PROVIDER_REQUEST_STARTED", `Provider request: ${method}`, {
    method,
    chainId: context.chainId,
    data: { params },
  });
  try {
    const result = await fn();
    appendBridgeDiagnostic("success", "PROVIDER_REQUEST_SUCCESS", `Provider request succeeded: ${method}`, {
      method,
      chainId: context.chainId,
      durationMs: Math.round(performance.now() - started),
      data: { result },
    });
    return result;
  } catch (error) {
    appendBridgeDiagnostic("error", "PROVIDER_REQUEST_ERROR", `Provider request failed: ${method}`, {
      method,
      chainId: context.chainId,
      durationMs: Math.round(performance.now() - started),
      data: { params },
      error,
    });
    throw error;
  }
}

export function getBridgeDiagnostic(): BridgeDiagnosticSession | null {
  return load();
}

export function clearBridgeDiagnostic() {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}

export function exportBridgeDiagnostic() {
  const session = load();
  if (!session) return null;
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `agfusion-bridge-debug-${session.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return session;
}
