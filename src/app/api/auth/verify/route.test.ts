import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  safeParse: vi.fn(),
  resolveSiweOrigin: vi.fn(),
  upsertUser: vi.fn(),
  verifySiwe: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "siwe-verify-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/validation", () => ({
  siweVerifySchema: { safeParse: mocks.safeParse },
}));
vi.mock("@/lib/siwe", () => ({
  resolveSiweOrigin: mocks.resolveSiweOrigin,
  upsertUser: mocks.upsertUser,
  verifySiwe: mocks.verifySiwe,
}));
vi.mock("@/lib/session", () => ({
  createSession: mocks.createSession,
  setSessionCookie: mocks.setSessionCookie,
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/auth/verify body limit", () => {
  it("rejects oversized streamed JSON before SIWE validation or session creation", async () => {
    const request = new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(17 * 1024), signature: "0x1234" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.safeParse).not.toHaveBeenCalled();
    expect(mocks.verifySiwe).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("keeps malformed JSON on the existing invalid_request response", async () => {
    const response = await POST(new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"message":',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.safeParse).not.toHaveBeenCalled();
  });
});
