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

afterEach(() => {
  vi.clearAllMocks();
});

describe("createX402Challenge", () => {
  it("rejects invalid recipients before touching the database", async () => {
    const result = await createX402Challenge({ recipient: "0x_bad" });
    expect(result).toEqual({ ok: false, reason: "invalid_recipient" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("fails closed when PostgreSQL is unavailable", async () => {
    configured.mockReturnValue(false);
    const result = await createX402Challenge({
      recipient: "0x1111111111111111111111111111111111111111",
    });
    expect(result).toEqual({ ok: false, reason: "database_unavailable" });
    expect(prisma).not.toHaveBeenCalled();
  });

  it("persists a five-minute challenge bound to one service and payment tuple", async () => {
    configured.mockReturnValue(true);
    const now = new Date("2026-10-31T18:00:00.000Z");
    const recipient = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const create = vi.fn().mockImplementation(async ({ data }) => ({
      id: "challenge-row-1",
      nonce: data.nonce,
      expiresAt: data.expiresAt,
    }));
    prisma.mockReturnValue({ x402Challenge: { create } } as never);

    const result = await createX402Challenge({ recipient, now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.challenge).toMatchObject({
      id: "challenge-row-1",
      serviceId: X402_AGENT_SERVICE_ID,
      chainId: X402_ARC_TESTNET.chainId,
      token: X402_ARC_TESTNET.token,
      recipient: recipient.toLowerCase(),
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
      recipient: recipient.toLowerCase(),
      amount: "1000",
      expiresAt: new Date(now.getTime() + X402_CHALLENGE_TTL_MS),
    });
  });

  it("fails closed when challenge persistence throws", async () => {
    configured.mockReturnValue(true);
    const create = vi.fn().mockRejectedValue(new Error("database offline"));
    prisma.mockReturnValue({ x402Challenge: { create } } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(createX402Challenge({
      recipient: "0x1111111111111111111111111111111111111111",
    })).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(warn).toHaveBeenCalledOnce();
  });
});
