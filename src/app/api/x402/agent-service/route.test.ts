import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimit: vi.fn(() => ({ ok: true })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("x402 agent service Mainnet guard", () => {
  it("does not advertise Testnet payment requirements from a Mainnet build", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.resetModules();

    const route = await import("./route");
    const response = await route.GET(
      new Request("http://localhost/api/x402/agent-service"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "service_unavailable",
    });
  });

  it("rejects POST payment attempts on Mainnet before verification", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.resetModules();

    const route = await import("./route");
    const response = await route.POST(
      new Request("http://localhost/api/x402/agent-service", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-payment-tx": `0x${"11".repeat(32)}`,
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "service_unavailable",
    });
  });
});
