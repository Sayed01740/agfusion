import { randomUUID } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/db";
import { getX402Recipient } from "@/lib/x402-config";
import { X402_ARC_TESTNET } from "@/lib/x402-verifier";

export const X402_AGENT_SERVICE_ID = "agfusion-agent-feed:v1";
export const X402_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type X402ChallengeResult =
  | {
      ok: true;
      challenge: {
        id: string;
        nonce: string;
        serviceId: string;
        chainId: number;
        token: string;
        recipient: string;
        amount: string;
        decimals: number;
        expiresAt: string;
      };
    }
  | {
      ok: false;
      reason: "database_unavailable" | "missing_recipient" | "invalid_recipient";
    };

/**
 * Persist an immutable, short-lived challenge using only the server-owned
 * settlement recipient. Issuing a challenge does not authorize access.
 * The HTTP endpoint remains disabled until the activation gates are approved.
 */
export async function createX402Challenge(opts: {
  now?: Date;
} = {}): Promise<X402ChallengeResult> {
  const recipientConfig = getX402Recipient();
  if (!recipientConfig.ok) return recipientConfig;
  if (!isDbConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }

  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + X402_CHALLENGE_TTL_MS);
  const nonce = randomUUID();
  const recipient = recipientConfig.recipient;

  try {
    const row = await getPrisma().x402Challenge.create({
      data: {
        nonce,
        serviceId: X402_AGENT_SERVICE_ID,
        chainId: X402_ARC_TESTNET.chainId,
        token: X402_ARC_TESTNET.token,
        recipient,
        amount: X402_ARC_TESTNET.amount,
        expiresAt,
      },
      select: { id: true, nonce: true, expiresAt: true },
    });

    return {
      ok: true,
      challenge: {
        id: row.id,
        nonce: row.nonce,
        serviceId: X402_AGENT_SERVICE_ID,
        chainId: X402_ARC_TESTNET.chainId,
        token: X402_ARC_TESTNET.token,
        recipient,
        amount: X402_ARC_TESTNET.amount,
        decimals: X402_ARC_TESTNET.decimals,
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  } catch (error) {
    console.warn("[x402] challenge creation unavailable; refusing authorization", error);
    return { ok: false, reason: "database_unavailable" };
  }
}

export type X402ChallengeForVerification =
  | {
      ok: true;
      challenge: {
        id: string;
        nonce: string;
        serviceId: typeof X402_AGENT_SERVICE_ID;
        chainId: number;
        token: string;
        recipient: string;
        amount: string;
      };
    }
  | { ok: false; reason: "database_unavailable" | "challenge_invalid" };

/**
 * Load the server-stored challenge tuple. Never accept recipient, token,
 * amount, chain ID, or service ID as authoritative POST input.
 */
export async function getX402ChallengeForVerification(input: {
  id: string;
  nonce: string;
  now?: Date;
}): Promise<X402ChallengeForVerification> {
  if (!input.id || !input.nonce) {
    return { ok: false, reason: "challenge_invalid" };
  }
  if (!isDbConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }

  try {
    const row = await getPrisma().x402Challenge.findFirst({
      where: {
        id: input.id,
        nonce: input.nonce,
        serviceId: X402_AGENT_SERVICE_ID,
        expiresAt: { gt: input.now ?? new Date() },
        consumedAt: null,
      },
      select: {
        id: true,
        nonce: true,
        serviceId: true,
        chainId: true,
        token: true,
        recipient: true,
        amount: true,
      },
    });

    if (
      !row ||
      row.serviceId !== X402_AGENT_SERVICE_ID ||
      row.chainId !== X402_ARC_TESTNET.chainId ||
      row.token.toLowerCase() !== X402_ARC_TESTNET.token ||
      row.amount !== X402_ARC_TESTNET.amount ||
      !/^0x[a-f0-9]{40}$/i.test(row.recipient)
    ) {
      return { ok: false, reason: "challenge_invalid" };
    }

    return {
      ok: true,
      challenge: {
        ...row,
        serviceId: X402_AGENT_SERVICE_ID,
        token: row.token.toLowerCase(),
        recipient: row.recipient.toLowerCase(),
      },
    };
  } catch (error) {
    console.warn("[x402] challenge lookup unavailable; refusing authorization", error);
    return { ok: false, reason: "database_unavailable" };
  }
}
