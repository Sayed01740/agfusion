/**
 * Server-only Circle Kit key resolution + live credential check.
 * Permanent model: one KIT_KEY on Vercel → all users swap without pasting.
 */

import { isValidKitKeyShape, normalizeKitKey } from "@/lib/kit-key";

export function getServerKitKey(): string | null {
  const raw = (
    process.env.KIT_KEY ||
    process.env.CIRCLE_KIT_KEY ||
    process.env.NEXT_PUBLIC_KIT_KEY ||
    ""
  )
    .replace(/\\n/gi, "")
    .replace(/\\r/gi, "")
    .replace(/\\/g, "")
    .replace(/[\r\n\t"']/g, "")
    .trim();

  if (!raw) return null;
  const n = normalizeKitKey(raw);
  // Match Circle SDK apiKeySchema: KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+
  if (!/^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(n)) {
    console.warn(
      "[circle-kit] KIT_KEY present but failed format check (expected KIT_KEY:id:secret)",
    );
    return null;
  }
  return n;
}

/**
 * Probe Circle Stablecoin Service with the server kit key.
 * 401/403 → invalid credentials. Other statuses mean the key was accepted.
 */
export async function verifyKitKeyWithCircle(
  kitKey: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  try {
    // Real createSwap endpoint used by App Kit — empty body will fail validation
    // but NOT with 401 if the key is good.
    const res = await fetch("https://api.circle.com/v1/stablecoinKits/swap", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kitKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    let message = text.slice(0, 200);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      message = j.message || j.error || message;
    } catch {
      /* keep */
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message:
          message ||
          "Circle rejected the kit key (invalid credentials). Create a new Kit key at console.circle.com → Keys → Kit keys.",
      };
    }

    // 400/404/422 = auth passed, request body invalid — that is success for key check
    return {
      ok: true,
      status: res.status,
      message: "Kit key accepted by Circle",
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Could not reach api.circle.com",
    };
  }
}

export function kitKeyHint(kitKey: string): string {
  const secret = kitKey.replace(/^KIT_KEY:/i, "").split(":")[1] || "";
  return secret.length >= 4 ? `…${secret.slice(-4)}` : "set";
}

// re-export for route handlers that used local helpers
export { isValidKitKeyShape, normalizeKitKey };
