/**
 * Server-only Circle App Kit credential helpers.
 *
 * Kit keys are bearer credentials and must never be stored in browser storage
 * or exposed through NEXT_PUBLIC_* variables. Live swaps now use the server-side
 * Circle swap preparation endpoint.
 */

const STORAGE_KEY = "agfusion_kit_key";

export function normalizeKitKey(raw: string): string {
  let k = String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/gi, "")
    .replace(/\\r/gi, "")
    .replace(/\\/g, "")
    .replace(/[\r\n\t"']/g, "")
    .trim();
  k = k.replace(/^NEXT_PUBLIC_KIT_KEY\s*[:=]\s*/i, "").trim();
  k = k.replace(/^process\.env\.\w+\s*[:=]\s*/i, "").trim();
  if (/^KIT_KEY:/i.test(k)) {
    const rest = k.replace(/^KIT_KEY:/i, "").replace(/\s+/g, "");
    return `KIT_KEY:${rest}`;
  }
  k = k.replace(/^KIT_KEY\s*[:=]\s*/i, "").replace(/\s+/g, "").trim();
  if (/^[a-f0-9]{8,}:[a-f0-9]{8,}$/i.test(k)) return `KIT_KEY:${k}`;
  return k;
}

export function isValidKitKeyShape(key: string | null | undefined): boolean {
  if (!key) return false;
  return /^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(normalizeKitKey(key));
}

/** Browser callers intentionally receive no Kit credential. */
export function getPublicKitKey(): string | undefined {
  return undefined;
}

/** Deprecated: Kit credentials are no longer accepted in browser storage. */
export function setSessionKitKey(_key: string | null): void {
  if (typeof window !== "undefined") {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }
  throw new Error("Circle Kit keys are server-only. Configure KIT_KEY on Vercel instead of pasting a key into the browser.");
}

export function clearSessionKitKey(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export function hasKitKey(): boolean { return false; }

/** Legacy callers get no browser credential and must use their server-backed flow. */
export async function ensureKitKey(): Promise<string | undefined> { return undefined; }

function digErrorText(e: unknown, depth = 0): string[] {
  if (e == null || depth > 6) return [];
  if (typeof e === "string") return e.trim() ? [e.trim()] : [];
  if (typeof e !== "object") return [String(e)];
  const o = e as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["shortMessage", "message", "details", "reason", "data"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (v && typeof v === "object") {
      try { out.push(JSON.stringify(v).slice(0, 240)); } catch {}
    }
  }
  if (o.code != null) out.push(`code=${String(o.code)}`);
  if (typeof o.name === "string" && o.name && o.name !== "Error") out.push(o.name);
  const cause = o.cause;
  if (cause && typeof cause === "object") {
    const c = cause as Record<string, unknown>;
    out.push(...digErrorText(c, depth + 1));
    const trace = c.trace;
    if (trace && typeof trace === "object") {
      const t = trace as Record<string, unknown>;
      if (t.rawError) out.push(...digErrorText(t.rawError, depth + 1));
      if (typeof t.operation === "string") out.push(`op=${t.operation}`);
      if (typeof t.chain === "string") out.push(`chain=${t.chain}`);
    }
  }
  if (o.rawError) out.push(...digErrorText(o.rawError, depth + 1));
  if (o.error) out.push(...digErrorText(o.error, depth + 1));
  return out;
}

export function formatKitError(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of digErrorText(e)) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.join(" · ") || String(e);
}

export const KIT_KEY_HELP =
  "Circle Kit key is server-only. Configure KIT_KEY on Vercel from Circle Console → Keys → Kit keys. Do not use NEXT_PUBLIC_KIT_KEY or paste the key into the browser.";
