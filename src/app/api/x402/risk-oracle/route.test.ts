import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-economy", () => ({ assessRouteRisk: vi.fn() }));
vi.mock("@/blockchain/appkit-service", () => ({ estimateBridgeDemo: vi.fn() }));
vi.mock("@/lib/chains", () => ({ resolveChain: vi.fn() }));
vi.mock("@/lib/onchain", () => ({ AGFUSION_DEPLOYER: "" }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimit: vi.fn(() => ({ ok: true })),
}));
vi.mock("@/lib/db", () => ({
  getPrisma: vi.fn(),
  isDbConfigured: vi.fn(() => false),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("x402 risk oracle Mainnet guard", () => {
  it("fails closed for GET payment requirements on Mainnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.resetModules();

    const route = await import("./route");
    const response = await route.GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "service_unavailable",
    });
  });

  it("fails closed for POST payment attempts on Mainnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042");
    vi.resetModules();

    const route = await import("./route");
    const response = await route.POST(
      new Request("http://localhost/api/x402/risk-oracle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentTxHash: `0x${"11".repeat(32)}` }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "service_unavailable",
    });
  });
});
