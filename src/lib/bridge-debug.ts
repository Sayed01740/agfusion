export type BridgeDebugEvent = {
  id: string;
  at: string;
  txId?: string;
  stage: string;
  message?: string;
  data?: unknown;
};

const KEY = "agfusion_bridge_debug_v2";
const LEGACY_KEY = "agfusion_bridge_debug_v1";
const MAX_EVENTS = 2000;

function safe(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth]";
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, cause: safe(value.cause, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => safe(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 500)) {
      const lower = k.toLowerCase();
      if (/private.?key|secret|seed|mnemonic|password|authorization|cookie|access.?token|refresh.?token/.test(lower)) out[k] = "[redacted]";
      else out[k] = safe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function readEvents(): BridgeDebugEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const current = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    if (Array.isArray(current)) return current;
  } catch {}
  try {
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) || "[]");
    if (Array.isArray(legacy)) return legacy;
  } catch {}
  return [];
}

export function recordBridgeDebug(stage: string, data?: unknown, txId?: string, message?: string): void {
  if (typeof window === "undefined") return;
  const event: BridgeDebugEvent = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString(), txId, stage, message, data: safe(data) };
  try {
    const current = readEvents();
    current.push(event);
    const payload = JSON.stringify(current.slice(-MAX_EVENTS));
    window.localStorage.setItem(KEY, payload);
    // sessionStorage is a second local fallback if a browser extension clears localStorage.
    try { window.sessionStorage.setItem(KEY, payload); } catch {}
  } catch (storageError) {
    try { window.sessionStorage.setItem(KEY, JSON.stringify([event])); } catch {}
    try { console.error("[AGFusion Bridge Diagnostics] storage failure", storageError); } catch {}
  }
  try {
    console.debug("[AGFusion Bridge]", event);
  } catch {}
}

/** Attach to the actual EIP-1193 provider object used by App Kit. This is deliberately
 * in-place so App Kit keeps the same object reference while every wallet RPC/signature
 * request is captured. */
export function attachBridgeProviderDiagnostics(provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> }, label: string, txId?: string): void {
  if (!provider || typeof provider.request !== "function") return;
  const marker = "__agfusionBridgeDebugWrapped";
  const p = provider as unknown as Record<string, unknown>;
  if (p[marker]) return;
  const original = provider.request.bind(provider);
  p[marker] = true;
  provider.request = async (args) => {
    const started = performance.now();
    recordBridgeDebug("wallet.request", { label, method: args.method, params: args.params }, txId);
    try {
      const result = await original(args);
      recordBridgeDebug("wallet.response", { label, method: args.method, durationMs: Math.round(performance.now() - started), result }, txId);
      return result;
    } catch (error) {
      recordBridgeDebug("wallet.error", { label, method: args.method, durationMs: Math.round(performance.now() - started), error }, txId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}

export function installBridgeGlobalDiagnostics(txId?: string): () => void {
  if (typeof window === "undefined") return () => {};
  const onError = (event: ErrorEvent) => recordBridgeDebug("window.error", { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error }, txId, event.message);
  const onReject = (event: PromiseRejectionEvent) => recordBridgeDebug("window.unhandledrejection", { reason: event.reason }, txId, String(event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  recordBridgeDebug("diagnostics.installed", { version: 2, userAgent: navigator.userAgent, url: location.href }, txId);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
}

export function getBridgeDebugEvents(): BridgeDebugEvent[] {
  return readEvents();
}

export function clearBridgeDebugEvents(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(LEGACY_KEY); window.sessionStorage.removeItem(KEY); } catch {}
}

export function downloadBridgeDebugLog(): void {
  if (typeof window === "undefined") return;
  const events = getBridgeDebugEvents();
  const payload = { exportedAt: new Date().toISOString(), app: "AGFusion", purpose: "Circle CCTP bridge diagnostic log", diagnosticVersion: 2, eventCount: events.length, events };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agfusion-bridge-debug-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
