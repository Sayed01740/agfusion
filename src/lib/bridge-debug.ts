export type BridgeDebugEvent = {
  id: string;
  sequence: number;
  at: string;
  txId?: string;
  stage: string;
  message?: string;
  method?: string;
  chainId?: string;
  durationMs?: number;
  data?: unknown;
  error?: unknown;
};

export type BridgeDebugSession = {
  diagnosticVersion: 4;
  sessionId: string;
  exportedAt: string;
  app: "AGFusion";
  purpose: "Circle CCTP bridge diagnostic log";
  eventCount: number;
  context: Record<string, unknown>;
  events: BridgeDebugEvent[];
};

const KEY = "agfusion_bridge_debug_v4";
const MAX_EVENTS = 2000;
const SERVER_ENDPOINT = "/api/bridge-diagnostics";

function safe(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth]";
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, cause: safe((value as Error & { cause?: unknown }).cause, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => safe(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 500)) {
      if (/private.?key|secret|seed|mnemonic|password|authorization|cookie|access.?token|refresh.?token|api.?key/i.test(k)) out[k] = "[redacted]";
      else out[k] = safe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sessionId(txId?: string) {
  return txId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readEvents(): BridgeDebugEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(events: BridgeDebugEvent[]) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(events.slice(-MAX_EVENTS));
  try { window.localStorage.setItem(KEY, payload); } catch {}
  try { window.sessionStorage.setItem(KEY, payload); } catch {}
}

function sendToServer(event: BridgeDebugEvent, txId?: string) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    diagnosticVersion: 4,
    sessionId: txId,
    app: "AGFusion",
    purpose: "Circle CCTP bridge diagnostic log",
    event,
  });
  try {
    if (typeof navigator.sendBeacon === "function" && body.length < 60_000) {
      const accepted = navigator.sendBeacon(SERVER_ENDPOINT, new Blob([body], { type: "application/json" }));
      if (accepted) return;
    }
  } catch {}
  void fetch(SERVER_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

export function recordBridgeDebug(stage: string, data?: unknown, txId?: string, message?: string, extra: { method?: string; chainId?: string | number; durationMs?: number; error?: unknown } = {}): void {
  if (typeof window === "undefined") return;
  const current = readEvents();
  const event: BridgeDebugEvent = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    sequence: current.length + 1,
    at: new Date().toISOString(),
    txId,
    stage,
    message,
    method: extra.method,
    chainId: extra.chainId === undefined ? undefined : String(extra.chainId),
    durationMs: extra.durationMs,
    data: safe(data),
    error: extra.error === undefined ? undefined : safe(extra.error),
  };
  current.push(event);
  persist(current);
  try { console.debug("[AGFusion Bridge]", event); } catch {}
  sendToServer(event, txId);
}

export function attachBridgeProviderDiagnostics(provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> }, label: string, txId?: string): void {
  if (!provider || typeof provider.request !== "function") return;
  const marker = "__agfusionBridgeDebugWrappedV4";
  const p = provider as unknown as Record<string, unknown>;
  if (p[marker]) return;
  p[marker] = true;
  const original = provider.request.bind(provider);
  provider.request = async (args) => {
    const started = performance.now();
    recordBridgeDebug("wallet.request", { label, params: args.params }, txId, `Wallet/provider request: ${args.method}`, { method: args.method });
    try {
      const result = await original(args);
      recordBridgeDebug("wallet.response", { label, result }, txId, `Wallet/provider response: ${args.method}`, { method: args.method, durationMs: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      recordBridgeDebug("wallet.error", { label, params: args.params }, txId, error instanceof Error ? error.message : String(error), { method: args.method, durationMs: Math.round(performance.now() - started), error });
      throw error;
    }
  };
}

export function installBridgeGlobalDiagnostics(txId?: string): () => void {
  if (typeof window === "undefined") return () => {};
  const id = sessionId(txId);
  const onError = (e: ErrorEvent) => recordBridgeDebug("window.error", { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error }, id, e.message, { error: e.error });
  const onReject = (e: PromiseRejectionEvent) => recordBridgeDebug("window.unhandledrejection", { reason: e.reason }, id, String(e.reason), { error: e.reason });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  recordBridgeDebug("diagnostics.installed", { version: 4, url: location.href, userAgent: navigator.userAgent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, id, "Bridge diagnostics installed");
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
    recordBridgeDebug("diagnostics.stopped", { version: 4 }, id, "Bridge diagnostics stopped");
  };
}

export function getBridgeDebugEvents(): BridgeDebugEvent[] { return readEvents(); }

export function clearBridgeDebugEvents(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); window.sessionStorage.removeItem(KEY); } catch {}
}

export function downloadBridgeDebugLog(): void {
  if (typeof window === "undefined") return;
  const events = getBridgeDebugEvents();
  const payload: BridgeDebugSession = {
    exportedAt: new Date().toISOString(),
    app: "AGFusion",
    purpose: "Circle CCTP bridge diagnostic log",
    diagnosticVersion: 4,
    sessionId: events[0]?.txId || sessionId(),
    eventCount: events.length,
    context: { url: location.href, userAgent: navigator.userAgent },
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agfusion-bridge-debug-v4-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
