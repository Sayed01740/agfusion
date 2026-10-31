import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(),
}));

import { getPrisma, isDbConfigured } from "@/lib/db";
import {
  createX402Challenge,
  X402_AGENT_SERVICE_ID,
  X402_CHALLENGE_TTL_MS,
} from "./x402-challenge";
import { X402_ARC_TESTNET } from "./x402-verifier";

const configured = vi.mocked(isDbConfigured);
const prisma = vi.mocked(getPrisma);
const VALID_RECIPIENT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("createX402Challenge", () => {
  it("fails closed when the server-only recipient is missing", async () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY", VALID_RECIPIENT);
    const result = await createX402Challenge();
    expect(result).toEqual({ ok: false, reason: "missing_recipient" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("rejects an invalid server-only recipient", async () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "0x_bad");
    const result = await createX402Challenge();
    expect(result).toEqual({ ok: false, reason: "invalid_recipient" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("fails closed when PostgreSQL is unavailable", async () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", VALID_RECIPIENT);
    configured.mockReturnValue(false);
    const result = await createX402Challenge();
    expect(result).toEqual({ ok: false, reason: "database_unavailable" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("persists a five-minute challenge bound to the server recipient and payment tuple", async () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    configured.mockReturnValue(true);
    const now = new Date("2026-10-31T18:00:00.000Z");
    const create = vi.fn().mockImplementation(async ({ data }) => ({
      id: "challenge-row-1",
      nonce: data.nonce,
      expiresAt: data.expiresAt,
    }));
    prisma.mockReturnValue({ x402Challenge: { create } } as never);

    const result = await createX402Challenge({ now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.challenge).toMatchObject({
      id: "challenge-row-1",
      serviceId: X402_AGENT_SERVICE_ID,
      chainId: X402_ARC_TESTNET.chainId,
      token: X402_ARC_TESTNET.token,
      recipient: VALID_RECIPIENT,
      amount: "1000",
      decimals: 6,
      expiresAt: new Date(now.getTime() + X402_CHALLENGE_TTL_MS).toISOString(),
    });
    expect(result.challenge.nonce).toMatch(/^[0-9a-f-]{36}$/i);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({
      serviceId: X402_AGENT_SERVICE_ID,
      chainId: 5042002,
      token: X402_ARC_TESTNET.token,
      recipient: VALID_RECIPIENT,
      amount: "1000",
      expiresAt: new Date(now.getTime() + X402_CHALLENGE_TTL_MS),
    });
  });

  it("fails closed when challenge persistence throws", async () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", VALID_RECIPIENT);
    configured.mockReturnValue(true);
    const create = vi.fn().mockRejectedValue(new Error("database offline"));
    prisma.mockReturnValue({ x402Challenge: { create } } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(createX402Challenge()).resolves.toEqual({
      ok: false,
      reason: "database_unavailable",
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("getX402ChallengeForVerification", () => {
  const lookupInput = {
    id: "challenge-row-1",
    nonce: "persisted-nonce",
    now: new Date("2026-10-31T18:00:00.000Z"),
  };

  it("returns only the authoritative, unexpired stored payment tuple", async () => {
    configured.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue({
      id: lookupInput.id,
      nonce: lookupInput.nonce,
      serviceId: X402_AGENT_SERVICE_ID,
      chainId: X402_ARC_TESTNET.chainId,
      token: X402_ARC_TESTNET.token.toUpperCase(),
      recipient: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      amount: X402_ARC_TESTNET.amount,
    });
    prisma.mockReturnValue({ x402Challenge: { findFirst } } as never);

    const { getX402ChallengeForVerification } = await import("./x402-challenge");
    const result = await getX402ChallengeForVerification(lookupInput);

    expect(result).toEqual({
      ok: true,
      challenge: {
        id: lookupInput.id,
        nonce: lookupInput.nonce,
        serviceId: X402_AGENT_SERVICE_ID,
        chainId: X402_ARC_TESTNET.chainId,
        token: X402_ARC_TESTNET.token,
        recipient: VALID_RECIPIENT,
        amount: X402_ARC_TESTNET.amount,
      },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: lookupInput.id,
        nonce: lookupInput.nonce,
        serviceId: X402_AGENT_SERVICE_ID,
        expiresAt: { gt: lookupInput.now },
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
  });

  it("rejects absent, expired, consumed, or mismatched stored challenges", async () => {
    configured.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue(null);
    prisma.mockReturnValue({ x402Challenge: { findFirst } } as never);
    const { getX402ChallengeForVerification } = await import("./x402-challenge");

    await expect(getX402ChallengeForVerification(lookupInput)).resolves.toEqual({
      ok: false,
      reason: "challenge_invalid",
    });
  });

  it("fails closed when the database is unavailable", async () => {
    configured.mockReturnValue(false);
    const { getX402ChallengeForVerification } = await import("./x402-challenge");

    await expect(getX402ChallengeForVerification(lookupInput)).resolves.toEqual({
      ok: false,
      reason: "database_unavailable",
    });
    expect(prisma).not.toHaveBeenCalled();
  });
});
