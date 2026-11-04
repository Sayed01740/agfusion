import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: mocks.getPrisma,
}));
vi.mock("@/lib/agent-economy", () => ({ assessRouteRisk: vi.fn() }));
vi.mock("@/blockchain/appkit-service", () => ({ estimateBridgeDemo: vi.fn() }));

function expectDisabled(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("/api/x402/risk-oracle fail-closed behavior", () => {
  it("does not advertise a payment challenge or recipient on GET", async () => {
    const response = await GET();
    expectDisabled(response);

    const body = await response.json();
    expect(body).toMatchObject({
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
    });
    expect(body).not.toHaveProperty("accepts");
    expect(body).not.toHaveProperty("payTo");
    expect(body).not.toHaveProperty("payment");
    expect(body).not.toHaveProperty("paid");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it("rejects POST without inspecting or accepting a supplied payment hash", async () => {
    const response = await POST(new Request("http://localhost/api/x402/risk-oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: "100",
        paymentTxHash: "0x" + "a".repeat(64),
        payer: "0x0000000000000000000000000000000000000001",
      }),
    }));

    expectDisabled(response);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
    });
    expect(body).not.toHaveProperty("accepts");
    expect(body).not.toHaveProperty("payTo");
    expect(body).not.toHaveProperty("payment");
    expect(body).not.toHaveProperty("paid");
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails closed for malformed POST bodies too", async () => {
    const response = await POST(new Request("http://localhost/api/x402/risk-oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }));

    expectDisabled(response);
    expect(await response.json()).toMatchObject({
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
    });
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
