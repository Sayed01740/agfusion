import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  fetchOwnedWallet: vi.fn(),
  getCircleApiKey: vi.fn(),
  isValidEthereumAddress: vi.fn(),
  isValidUserToken: vi.fn(),
  upsertUser: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "circle-auth-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/circle-pw-server", () => ({
  fetchOwnedWallet: mocks.fetchOwnedWallet,
  getCircleApiKey: mocks.getCircleApiKey,
  isValidEthereumAddress: mocks.isValidEthereumAddress,
  isValidUserToken: mocks.isValidUserToken,
}));
vi.mock("@/lib/siwe", () => ({ upsertUser: mocks.upsertUser }));
vi.mock("@/lib/session", () => ({
  createSession: mocks.createSession,
  setSessionCookie: mocks.setSessionCookie,
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/auth/circle body limit", () => {
  it("rejects oversized streamed JSON before Circle auth or session work", async () => {
    const request = new Request("http://localhost/api/auth/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userToken: "x".repeat(17 * 1024), walletId: "wallet-1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.fetchOwnedWallet).not.toHaveBeenCalled();
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON without destructuring it", async () => {
    const response = await POST(new Request("http://localhost/api/auth/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(null),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.fetchOwnedWallet).not.toHaveBeenCalled();
  });
});
