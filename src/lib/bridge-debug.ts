export type BridgeDebugEvent = { id: string; at: string; txId?: string; stage: string; message?: string; data?: unknown };
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
      if (/private.?key|secret|seed|mnemonic|password|authorization|cookie|access.?token|refresh.?token/i.test(k)) out[k] = "[redacted]";
      else out[k] = safe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}
function readEvents(): BridgeDebugEvent[] {
  if (typeof window === "undefined") return [];
  for (const key of [KEY, LEGACY_KEY]) {
    try { const parsed = JSON.parse(window.localStorage.getItem(key) || "[]"); if (Array.isArray(parsed) && parsed.length) return parsed; } catch {}
  }
  try { const parsed = JSON.parse(window.sessionStorage.getItem(KEY) || "[]"); if (Array.isArray(parsed)) return parsed; } catch {}
  return [];
}
export function recordBridgeDebug(stage: string, data?: unknown, txId?: string, message?: string): void {
  if (typeof window === "undefined") return;
  const event = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString(), txId, stage, message, data: safe(data) };
  const current = readEvents(); current.push(event);
  const payload = JSON.stringify(current.slice(-MAX_EVENTS));
  try { window.localStorage.setItem(KEY, payload); } catch {}
  try { window.sessionStorage.setItem(KEY, payload); } catch {}
  try { console.debug("[AGFusion Bridge]", event); } catch {}
}
export function attachBridgeProviderDiagnostics(provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> }, label: string, txId?: string): void {
  if (!provider || typeof provider.request !== "function") return;
  const marker = "__agfusionBridgeDebugWrapped"; const p = provider as unknown as Record<string, unknown>;
  if (p[marker]) return; p[marker] = true;
  const original = provider.request.bind(provider);
  provider.request = async (args) => {
    const started = performance.now(); recordBridgeDebug("wallet.request", { label, method: args.method, params: args.params }, txId);
    try { const result = await original(args); recordBridgeDebug("wallet.response", { label, method: args.method, durationMs: Math.round(performance.now() - started), result }, txId); return result; }
    catch (error) { recordBridgeDebug("wallet.error", { label, method: args.method, durationMs: Math.round(performance.now() - started), error }, txId, error instanceof Error ? error.message : String(error)); throw error; }
  };
}
export function installBridgeGlobalDiagnostics(txId?: string): () => void {
  if (typeof window === "undefined") return () => {};
  const onError = (e: ErrorEvent) => recordBridgeDebug("window.error", { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error }, txId, e.message);
  const onReject = (e: PromiseRejectionEvent) => recordBridgeDebug("window.unhandledrejection", { reason: e.reason }, txId, String(e.reason));
  window.addEventListener("error", onError); window.addEventListener("unhandledrejection", onReject);
  recordBridgeDebug("diagnostics.installed", { version: 2, url: location.href, userAgent: navigator.userAgent }, txId);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
}
export function getBridgeDebugEvents(): BridgeDebugEvent[] { return readEvents(); }
export function clearBridgeDebugEvents(): void { if (typeof window === "undefined") return; try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(LEGACY_KEY); window.sessionStorage.removeItem(KEY); } catch {} }
export function downloadBridgeDebugLog(): void {
  if (typeof window === "undefined") return;
  const events = getBridgeDebugEvents();
  const payload = { exportedAt: new Date().toISOString(), app: "AGFusion", purpose: "Circle CCTP bridge diagnostic log", diagnosticVersion: 2, eventCount: events.length, events };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `agfusion-bridge-debug-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
