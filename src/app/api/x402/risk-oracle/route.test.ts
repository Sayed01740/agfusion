import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "x402-risk-body-limit-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/db", () => ({
  getPrisma: mocks.getPrisma,
  isDbConfigured: () => true,
}));
vi.mock("@/lib/agent-economy", () => ({ assessRouteRisk: vi.fn() }));
vi.mock("@/blockchain/appkit-service", () => ({ estimateBridgeDemo: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("POST /api/x402/risk-oracle request-body limit", () => {
  it("rejects oversized bodies before payment verification or persistence", async () => {
    const response = await POST(new Request("http://localhost/api/x402/risk-oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentTxHash: "0x" + "a".repeat(64), note: "x".repeat(9 * 1024) }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON before reading payment fields", async () => {
    const response = await POST(new Request("http://localhost/api/x402/risk-oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });
});
