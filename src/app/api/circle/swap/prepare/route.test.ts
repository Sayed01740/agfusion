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

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

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


  it("accepts Arc Testnet and returns its explicit chain ID", async () => {
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
        chainId: 5042002,
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).chainId).toBe(5042002);
    expect(mocks.estimateSwap).toHaveBeenCalledOnce();
  });

  it("keeps Arc Mainnet disabled unless the server release flag is enabled", async () => {
    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount: "1", tokenIn: "USDC", tokenOut: "EURC", chainId: 5042,
      }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "mainnet_swap_disabled" });
    expect(mocks.getServerKitKey).not.toHaveBeenCalled();
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("prepares an Arc Mainnet quote only when the server release flag is enabled", async () => {
    vi.stubEnv("ARC_MAINNET_SWAP_ENABLED", "true");
    mocks.getServerKitKey.mockReturnValue("test-kit-key");
    mocks.estimateSwap.mockResolvedValue({
      transactions: [{ to: "0x1111111111111111111111111111111111111111", data: "0x1234" }],
    });

    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount: "1", tokenIn: "USDC", tokenOut: "EURC", chainId: 5042,
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ chainId: 5042, network: "mainnet" });
    expect(mocks.estimateSwap).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.objectContaining({ chain: "Arc" }),
    }));
  });

  it("rejects Arc Mainnet before reading the Circle Kit credential or preparing a quote", async () => {
    const response = await POST(new Request("http://localhost/api/circle/swap/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        amount: "1",
        tokenIn: "USDC",
        tokenOut: "EURC",
        chainId: 5042,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "unsupported_swap_chain",
      detail: "Swap preparation is available on Arc Testnet only (5042002).",
    });
    expect(mocks.getServerKitKey).not.toHaveBeenCalled();
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("defaults to Arc Testnet even when no chain ID is supplied", async () => {
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
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).chainId).toBe(5042002);
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
