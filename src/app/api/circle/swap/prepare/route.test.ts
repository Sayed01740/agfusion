import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerKitKey: vi.fn<() => string | null>(() => null),
  estimateSwap: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "swap-route-test",
  rateLimit: () => ({ ok: true }),
}));

vi.mock("@/lib/circle-kit-server", () => ({
  getServerKitKey: mocks.getServerKitKey,
}));

vi.mock("@circle-fin/app-kit", () => ({
  AppKit: class {
    estimateSwap(...args: unknown[]) {
      return mocks.estimateSwap(...args);
    }
  },
}));

vi.mock("@circle-fin/adapter-viem-v2", () => ({
  createViemAdapterFromProvider: vi.fn(async () => ({ mockedAdapter: true })),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    defineChain: vi.fn((chain: unknown) => chain),
    createPublicClient: vi.fn(() => ({ request: vi.fn() })),
    http: vi.fn(() => ({ mockedTransport: true })),
  };
});

import { POST } from "@/app/api/circle/swap/prepare/route";
import { MAINNET_SWAP_NOT_READY_MESSAGE } from "@/lib/mainnet-swap-readiness";

const MOCK_TX_TO = "0x0000000000000000000000000000000000000002";

function requestFor(chainId: number, amount = "1") {
  return new Request("http://localhost/api/circle/swap/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: "0x0000000000000000000000000000000000000001",
      amount,
      tokenIn: "USDC",
      tokenOut: "EURC",
      chainId,
    }),
  });
}

describe("POST /api/circle/swap/prepare chain readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerKitKey.mockReturnValue(null);
    mocks.estimateSwap.mockResolvedValue({
      transactions: [{ to: MOCK_TX_TO, data: "0x1234", value: "0" }],
    });
  });

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["exponent notation", "1e3"],
    ["leading decimal point", ".5"],
    ["trailing decimal point", "1."],
    ["more than 18 decimal places", "1.1234567890123456789"],
    ["oversized input", "1".repeat(81)],
    ["non-numeric input", "NaN"],
  ])("rejects invalid amount (%s) before initializing Circle SDK", async (_label, amount) => {
    const response = await POST(requestFor(5042002, amount));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_amount" });
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("rejects Arc Mainnet before Circle SDK initialization while readiness is false", async () => {
    const response = await POST(requestFor(5042));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: MAINNET_SWAP_NOT_READY_MESSAGE,
    });
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("does not reject Arc Testnet at the Mainnet readiness gate", async () => {
    const response = await POST(requestFor(5042002));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Circle App Kit is not configured on the server.",
    });
    expect(mocks.estimateSwap).not.toHaveBeenCalled();
  });

  it("prepares a mocked Testnet quote and reports the requested Testnet chain ID", async () => {
    mocks.getServerKitKey.mockReturnValue("KIT_KEY:test:secret");

    const response = await POST(requestFor(5042002));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      chainId: 5042002,
      address: "0x0000000000000000000000000000000000000001",
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "1",
    });
    expect(body.transactions).toEqual([
      { to: MOCK_TX_TO, data: "0x1234", value: "0" },
    ]);
    expect(mocks.estimateSwap).toHaveBeenCalledTimes(1);
    expect(mocks.estimateSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.objectContaining({ chain: "Arc_Testnet" }),
        tokenIn: "USDC",
        tokenOut: "EURC",
        amountIn: "1",
      }),
    );
  });
});
