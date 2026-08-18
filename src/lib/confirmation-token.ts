import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_VERSION = "v1";
const TTL_SECONDS = 10 * 60;
const consumedTokens = new Set<string>();

type ConfirmationPayload = {
  v: typeof TOKEN_VERSION;
  exp: number;
  wallet: string;
  fingerprint: string;
};

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") {
    return "agfusion-local-dev-confirm-secret-change-me";
  }
  throw new Error("AUTH_SECRET is required for transaction confirmation tokens.");
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function normalizeWallet(wallet?: string | null): string {
  return String(wallet || "").trim().toLowerCase();
}

export function confirmationFingerprint(input: Record<string, unknown>): string {
  const canonical = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((out, key) => {
      const value = input[key];
      if (value !== undefined) out[key] = value;
      return out;
    }, {});
  return createHmac("sha256", secret())
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function issueConfirmationToken(input: {
  wallet?: string | null;
  action: Record<string, unknown>;
}): string {
  const payload: ConfirmationPayload = {
    v: TOKEN_VERSION,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    wallet: normalizeWallet(input.wallet),
    fingerprint: confirmationFingerprint(input.action),
  };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyConfirmationToken(input: {
  token?: string | null;
  wallet?: string | null;
  action: Record<string, unknown>;
}): boolean {
  const token = String(input.token || "");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  try {
    const expected = sign(encoded);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConfirmationPayload;
    if (!payload || payload.v !== TOKEN_VERSION) return false;
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return false;
    if (payload.wallet !== normalizeWallet(input.wallet)) return false;
    return payload.fingerprint === confirmationFingerprint(input.action);
  } catch {
    return false;
  }
}

/** Verify and consume a capability. Warm server instances reject replayed tokens. */
export function consumeConfirmationToken(input: {
  token?: string | null;
  wallet?: string | null;
  action: Record<string, unknown>;
}): boolean {
  const token = String(input.token || "");
  if (!verifyConfirmationToken(input) || consumedTokens.has(token)) return false;
  consumedTokens.add(token);
  if (consumedTokens.size > 2000) consumedTokens.clear();
  return true;
}
