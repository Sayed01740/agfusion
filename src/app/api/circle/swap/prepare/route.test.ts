import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getServerKitKey: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "circle-swap-prepare-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/circle-kit-server", () => ({
  getServerKitKey: mocks.getServerKitKey,
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/circle/swap/prepare request-body limit", () => {
  it("rejects oversized bodies before quote preparation", async () => {
    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "0x1111111111111111111111111111111111111111", amount: "1", note: "x".repeat(9 * 1024) }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.getServerKitKey).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON before reading swap fields", async () => {
    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(mocks.getServerKitKey).not.toHaveBeenCalled();
  });
});
