import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getCircleApiKey: vi.fn(),
  isValidBlockchain: vi.fn(),
  isValidUserToken: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "circle-challenge-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/circle-pw-server", () => ({
  getCircleApiKey: mocks.getCircleApiKey,
  isValidBlockchain: mocks.isValidBlockchain,
  isValidUserToken: mocks.isValidUserToken,
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/circle/pw/challenge request-body limit", () => {
  it("rejects oversized bodies before validation or Circle API calls", async () => {
    const response = await POST(new Request("http://localhost/api/circle/pw/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userToken: "x".repeat(9 * 1024), blockchains: ["ARC-TESTNET"] }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.isValidUserToken).not.toHaveBeenCalled();
    expect(mocks.getCircleApiKey).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON before reading fields", async () => {
    const response = await POST(new Request("http://localhost/api/circle/pw/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(mocks.getCircleApiKey).not.toHaveBeenCalled();
  });
});
