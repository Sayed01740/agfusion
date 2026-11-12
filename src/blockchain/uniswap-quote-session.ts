import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SESSION_VERSION = 1;
const SESSION_AAD = Buffer.from("agfusion:arc-mainnet:uniswap-quote:v1");
export const ARC_QUOTE_SESSION_TTL_SECONDS = 60;
const MAX_SESSION_TOKEN_LENGTH = 96 * 1024;

export type ArcUniswapQuoteSession = {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  chainId: 5042;
  account: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quotedAmountOut: string;
  minimumAmountOut: string;
  quote: Record<string, unknown>;
  permitData: Record<string, unknown> | null;
  requestId: string | null;
};

function deriveKey(secret: string): Buffer {
  const clean = typeof secret === "string" ? secret.trim() : "";
  if (clean.length < 32) {
    throw new Error("Arc quote session secret is not configured or is too short");
  }
  return createHash("sha256").update(clean, "utf8").digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSession(value: unknown, nowSeconds: number): ArcUniswapQuoteSession {
  if (!isRecord(value)) throw new Error("Invalid quote session payload");
  const session = value as unknown as ArcUniswapQuoteSession;
  if (
    session.version !== SESSION_VERSION ||
    session.chainId !== 5042 ||
    !Number.isSafeInteger(session.issuedAt) ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.issuedAt > nowSeconds + 5 ||
    session.expiresAt <= nowSeconds ||
    session.expiresAt <= session.issuedAt ||
    session.expiresAt - session.issuedAt > ARC_QUOTE_SESSION_TTL_SECONDS ||
    typeof session.account !== "string" ||
    typeof session.tokenIn !== "string" ||
    typeof session.tokenOut !== "string" ||
    typeof session.amountIn !== "string" ||
    typeof session.quotedAmountOut !== "string" ||
    typeof session.minimumAmountOut !== "string" ||
    !/^\d+$/.test(session.amountIn) ||
    !/^\d+$/.test(session.quotedAmountOut) ||
    !/^\d+$/.test(session.minimumAmountOut) ||
    !isRecord(session.quote) ||
    (session.permitData !== null && !isRecord(session.permitData)) ||
    (session.requestId !== null && typeof session.requestId !== "string")
  ) {
    throw new Error("Invalid or expired quote session");
  }
  return session;
}

export function createArcUniswapQuoteSession(
  input: Omit<ArcUniswapQuoteSession, "version" | "issuedAt" | "expiresAt">,
  secret = process.env.AGFUSION_QUOTE_SESSION_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number } {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error("Invalid quote session clock");
  const key = deriveKey(secret || "");
  const payload: ArcUniswapQuoteSession = {
    ...input,
    version: SESSION_VERSION,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ARC_QUOTE_SESSION_TTL_SECONDS,
  };
  validateSession(payload, nowSeconds);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(SESSION_AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    token: [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join("."),
    expiresAt: payload.expiresAt,
  };
}

export function decryptArcUniswapQuoteSession(
  token: string,
  secret = process.env.AGFUSION_QUOTE_SESSION_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): ArcUniswapQuoteSession {
  if (typeof token !== "string" || token.length < 40 || token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error("Invalid quote session token");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error("Invalid quote session token");
  }
  const key = deriveKey(secret || "");
  const iv = Buffer.from(parts[0], "base64url");
  const tag = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0 || encrypted.length > 64 * 1024) {
    throw new Error("Invalid quote session token");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(SESSION_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return validateSession(JSON.parse(plaintext) as unknown, nowSeconds);
  } catch {
    throw new Error("Quote session authentication failed or has expired");
  }
}


export type ArcUniswapReceiptTicket = {
  version: 1;
  purpose: "receipt-verification";
  issuedAt: number;
  expiresAt: number;
  chainId: 5042;
  account: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minimumAmountOut: string;
};

const RECEIPT_TICKET_AAD = Buffer.from("agfusion:arc-mainnet:uniswap-receipt:v1");
const RECEIPT_TICKET_TTL_SECONDS = 24 * 60 * 60;

export function createArcUniswapReceiptTicket(
  input: Omit<ArcUniswapReceiptTicket, "version" | "purpose" | "issuedAt" | "expiresAt">,
  secret = process.env.AGFUSION_QUOTE_SESSION_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number } {
  const key = deriveKey(secret || "");
  if (
    input.chainId !== 5042 ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.account) ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.tokenIn) ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.tokenOut) ||
    input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase() ||
    !/^\d+$/.test(input.amountIn) ||
    !/^\d+$/.test(input.minimumAmountOut) ||
    BigInt(input.amountIn) <= 0n ||
    BigInt(input.minimumAmountOut) <= 0n ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds <= 0
  ) {
    throw new Error("Invalid Arc receipt verification ticket");
  }
  const payload: ArcUniswapReceiptTicket = {
    ...input,
    version: 1,
    purpose: "receipt-verification",
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + RECEIPT_TICKET_TTL_SECONDS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(RECEIPT_TICKET_AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    token: [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join("."),
    expiresAt: payload.expiresAt,
  };
}

export function decryptArcUniswapReceiptTicket(
  token: string,
  secret = process.env.AGFUSION_QUOTE_SESSION_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): ArcUniswapReceiptTicket {
  if (typeof token !== "string" || token.length < 40 || token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error("Invalid receipt verification ticket");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error("Invalid receipt verification ticket");
  }
  const key = deriveKey(secret || "");
  const iv = Buffer.from(parts[0], "base64url");
  const tag = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0 || encrypted.length > 64 * 1024) {
    throw new Error("Invalid receipt verification ticket");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(RECEIPT_TICKET_AAD);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as unknown;
    if (!isRecord(payload)) throw new Error("Invalid receipt ticket payload");
    const ticket = payload as unknown as ArcUniswapReceiptTicket;
    if (
      ticket.version !== 1 ||
      ticket.purpose !== "receipt-verification" ||
      ticket.chainId !== 5042 ||
      !Number.isSafeInteger(ticket.issuedAt) ||
      !Number.isSafeInteger(ticket.expiresAt) ||
      ticket.issuedAt > nowSeconds + 5 ||
      ticket.expiresAt <= nowSeconds ||
      ticket.expiresAt - ticket.issuedAt > RECEIPT_TICKET_TTL_SECONDS ||
      !/^0x[0-9a-fA-F]{40}$/.test(ticket.account) ||
      !/^0x[0-9a-fA-F]{40}$/.test(ticket.tokenIn) ||
      !/^0x[0-9a-fA-F]{40}$/.test(ticket.tokenOut) ||
      ticket.tokenIn.toLowerCase() === ticket.tokenOut.toLowerCase() ||
      !/^\d+$/.test(ticket.amountIn) ||
      !/^\d+$/.test(ticket.minimumAmountOut)
    ) {
      throw new Error("Invalid or expired receipt ticket");
    }
    return ticket;
  } catch {
    throw new Error("Receipt verification ticket authentication failed or has expired");
  }
}
