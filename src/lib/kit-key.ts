/**
 * Circle App Kit key for live Swap on Arc Testnet.
 * Free: https://console.circle.com → Keys → Kit keys
 *
 * Circle expects: KIT_KEY:<keyId>:<keySecret>
 */

const STORAGE_KEY = "agfusion_kit_key";

/**
 * Normalize pasted keys into Circle's expected format.
 * Strips BOM, quotes, CR/LF, and accidental env labels.
 */
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
  const n = normalizeKitKey(key);
  return /^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(n);
}

export function getPublicKitKey(): string {
  if (typeof window !== "undefined") {
    try {
      const local = sessionStorage.getItem(STORAGE_KEY);
      if (local) {
        const n = normalizeKitKey(local);
        if (isValidKitKeyShape(n)) return n;
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  const env =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_KIT_KEY?.trim()
      : undefined;
  if (env) {
    const n = normalizeKitKey(env);
    if (isValidKitKeyShape(n)) return n;
  }

  return "";
}

export function setSessionKitKey(key: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!key?.trim()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const n = normalizeKitKey(key);
    if (!isValidKitKeyShape(n)) {
      throw new Error(
        "Invalid kit key format. Expected KIT_KEY:id:secret (hex id and secret).",
      );
    }
    sessionStorage.setItem(STORAGE_KEY, n);
  } catch (e) {
    if (e instanceof Error && /Invalid kit key/.test(e.message)) throw e;
  }
}

export function clearSessionKitKey(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasKitKey(): boolean {
  return Boolean(getPublicKitKey());
}

/**
 * Ensure a kit key is available for App Kit.
 * Order: valid session paste → NEXT_PUBLIC → server bootstrap (/api/kit).
 */
export async function ensureKitKey(): Promise<string> {
  const local = getPublicKitKey();
  if (local) return local;

  if (typeof window === "undefined") return "";

  try {
    const res = await fetch("/api/kit", { cache: "no-store" });
    if (!res.ok) return "";
    const data = (await res.json()) as { kitKey?: string | null };
    if (data.kitKey && isValidKitKeyShape(data.kitKey)) {
      const n = normalizeKitKey(data.kitKey);
      try {
        sessionStorage.setItem(STORAGE_KEY, n);
      } catch {
        /* ignore */
      }
      return n;
    }
  } catch {
    /* ignore */
  }
  return "";
}

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
  const parts = digErrorText(e);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  return unique.join(" · ") || String(e);
}

export const KIT_KEY_HELP =
  "Circle Kit key missing or invalid. Site owner: set KIT_KEY on Vercel to a NEW key from console.circle.com → Keys → Kit keys (format KIT_KEY:id:secret), redeploy. End users should not need to paste a key.";
