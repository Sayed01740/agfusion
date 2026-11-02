import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getServerKitKey: vi.fn(),
  estimateSwap: vi.fn(),
}));

vi.mock("@circle-fin/app-kit", () => ({
  AppKit: class {
    estimateSwap = mocks.estimateSwap;
  },
}));
vi.mock("@circle-fin/adapter-viem-v2", () => ({
  createViemAdapterFromProvider: vi.fn(async () => ({ mocked: true })),
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


  it.each([
    [5042002, "Arc Testnet"],
    [5042, "Arc Mainnet"],
  ])("returns the requested chain ID (%s) rather than the runtime default", async (chainId) => {
    mocks.getServerKitKey.mockReturnValue("test-kit-key");
    mocks.estimateSwap.mockResolvedValue({
      transactions: [{
        to: "0x1111111111111111111111111111111111111111",
        data: "0x1234",
      }],
    });

    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount: "1",
        tokenIn: "USDC",
        tokenOut: "EURC",
        chainId,
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).chainId).toBe(chainId);
    expect(mocks.estimateSwap).toHaveBeenCalledOnce();
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
  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["exponent notation", "1e3"],
    ["leading decimal point", ".5"],
    ["trailing decimal point", "1."],
    ["more than 6 decimal places", "1.1234567"],
    ["oversized input", "1".repeat(81)],
    ["non-numeric input", "NaN"],
  ])("rejects invalid amount (%s) before initializing Circle SDK", async (_label, amount) => {
    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount,
        tokenIn: "USDC",
        tokenOut: "EURC",
        chainId: 5042002,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_amount" });
    expect(mocks.getServerKitKey).not.toHaveBeenCalled();
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("accepts the full six-decimal precision supported by Arc USDC/EURC", async () => {
    mocks.getServerKitKey.mockReturnValue("test-kit-key");
    mocks.estimateSwap.mockResolvedValue({
      transactions: [{
        to: "0x1111111111111111111111111111111111111111",
        data: "0x1234",
      }],
    });

    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount: "1.123456",
        tokenIn: "USDC",
        tokenOut: "EURC",
        chainId: 5042002,
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).amountIn).toBe("1.123456");
    expect(mocks.estimateSwap).toHaveBeenCalledOnce();
  });

});
