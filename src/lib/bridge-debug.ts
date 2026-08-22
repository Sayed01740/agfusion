export type BridgeDebugEvent = {
  id: string;
  at: string;
  txId?: string;
  stage: string;
  message?: string;
  data?: unknown;
};

const KEY = "agfusion_bridge_debug_v1";
const MAX_EVENTS = 500;

function safe(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[max-depth]";
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => safe(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      const lower = k.toLowerCase();
      if (/private.?key|secret|seed|mnemonic|password|authorization|cookie|access.?token|refresh.?token/.test(lower)) {
        out[k] = "[redacted]";
      } else {
        out[k] = safe(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function recordBridgeDebug(stage: string, data?: unknown, txId?: string, message?: string): void {
  if (typeof window === "undefined") return;
  const event: BridgeDebugEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    txId,
    stage,
    message,
    data: safe(data),
  };
  try {
    const current = JSON.parse(window.localStorage.getItem(KEY) || "[]") as BridgeDebugEvent[];
    current.push(event);
    window.localStorage.setItem(KEY, JSON.stringify(current.slice(-MAX_EVENTS)));
  } catch {
    // Diagnostics must never break bridge execution.
  }
  try {
    console.groupCollapsed(`[AGFusion Bridge] ${stage}`);
    if (message) console.error(message);
    console.log(event.data);
    console.groupEnd();
  } catch {
    // Ignore console failures.
  }
}

export function getBridgeDebugEvents(): BridgeDebugEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as BridgeDebugEvent[];
  } catch {
    return [];
  }
}

export function clearBridgeDebugEvents(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function downloadBridgeDebugLog(): void {
  if (typeof window === "undefined") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "AGFusion",
    purpose: "Circle CCTP bridge diagnostic log",
    events: getBridgeDebugEvents(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agfusion-bridge-debug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
