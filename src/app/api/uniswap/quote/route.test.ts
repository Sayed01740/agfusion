import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const storeMocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("@/lib/arc-quote-session-store", () => ({ registerArcQuoteSession: storeMocks.register }));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "uniswap-arc-quote-test",
  rateLimit: () => ({ ok: true }),
}));

afterEach(() => {
  storeMocks.register.mockReset().mockResolvedValue({ ok: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(body: unknown) {
  return new Request("http://localhost/api/uniswap/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SESSION_SECRET = "test-only-quote-session-secret-with-over-32-bytes";

const permitData = {
  domain: { name: "Permit2", version: "1", chainId: 5042, verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
  types: {
    PermitDetails: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
  },
  values: {
    details: { token: "0x3600000000000000000000000000000000000000", amount: "10250000", expiration: "1800000900", nonce: "3" },
    spender: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
    sigDeadline: "1800000600",
  },
};

const validBody = {
  address: "0x1111111111111111111111111111111111111111",
  amount: "10.25",
  tokenIn: "USDC",
  tokenOut: "EURC",
  chainId: 5042,
  slippageBps: 100,
};

describe("POST /api/uniswap/quote", () => {
  it("fails closed when the server-only Uniswap API key is missing", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "uniswap_api_not_configured" });
  });

  it("rejects inherited object-property names as token symbols", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ ...validBody, tokenIn: "toString" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_swap_pair" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Testnet and other chains before calling Uniswap", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ ...validBody, chainId: 5042002 }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["too many decimals", "1.1234567"],
    ["exponent notation", "1e3"],
    ["zero", "0"],
    ["negative", "-1"],
  ])("rejects invalid amount: %s", async (_label, amount) => {
    vi.stubEnv("UNISWAP_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ ...validBody, amount }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a verified quote summary and encrypted session while exposing only the exact Permit2 typed data needed for signing", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "server-secret");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", SESSION_SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestId: "quote-123",
      routing: "CLASSIC",
      isTokenApprovalApplicable: true,
      quote: {
        classicGasUseEstimateUSD: "0.03",
        input: {
          token: "0x3600000000000000000000000000000000000000",
          amount: "10250000",
        },
        output: {
          token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
          recipient: "0x1111111111111111111111111111111111111111",
          amount: "9900000",
          minimumAmount: "9801000",
        },
      },
      swapTransaction: { to: "0x2222222222222222222222222222222222222222", data: "0xdeadbeef" },
      permitData,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      chainId: 5042,
      amountOut: "9.9",
      minimumAmountOut: "9.801",
      routing: "CLASSIC",
      requiresApproval: true,
      estimatedGasUsd: "0.03",
    });
    expect(data).not.toHaveProperty("swapTransaction");
    expect(data).not.toHaveProperty("quote");
    expect(data.quoteSession).toEqual(expect.any(String));
    expect(data.quoteSessionExpiresAt).toEqual(expect.any(Number));
    expect(data.permitData).toEqual(permitData);
    expect(storeMocks.register).toHaveBeenCalledWith({
      token: data.quoteSession,
      account: validBody.address,
      chainId: 5042,
      expiresAt: data.quoteSessionExpiresAt,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-api-key"]).toBe("server-secret");
    expect(init.headers["x-universal-router-version"]).toBe("2.1.2");
    expect(init.headers["x-permit2-disabled"]).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({
      tokenInChainId: 5042,
      tokenOutChainId: 5042,
      amount: "10250000",
      protocols: ["V2", "V3"],
      permitAmount: "EXACT",
    });
  });

  it("does not return a quote session when durable storage is unavailable", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "server-secret");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", SESSION_SECRET);
    storeMocks.register.mockResolvedValue({ ok: false, reason: "database_unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      routing: "CLASSIC",
      quote: {
        input: { token: "0x3600000000000000000000000000000000000000", amount: "10250000" },
        output: {
          token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
          recipient: validBody.address,
          amount: "9900000",
          minimumAmount: "9801000",
        },
      },
    }), { status: 200 })));
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "quote_session_store_unavailable" });
  });

  it("rejects a quote without the expected recipient", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "server-secret");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", SESSION_SECRET);
    const payload = {
      routing: "CLASSIC",
      quote: {
        input: { token: "0x3600000000000000000000000000000000000000", amount: "10250000" },
        output: {
          token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
          amount: "9900000",
          minimumAmount: "9801000",
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const response = await POST(request(validBody));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "unverified_uniswap_quote" });
  });

  it.each([
    ["missing", undefined],
    ["zero", "0"],
    ["greater than quoted output", "9900001"],
  ])("rejects an invalid minimum output: %s", async (_label, minimumAmount) => {
    vi.stubEnv("UNISWAP_API_KEY", "server-secret");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", SESSION_SECRET);
    const payload = {
      routing: "CLASSIC",
      quote: {
        input: { token: "0x3600000000000000000000000000000000000000", amount: "10250000" },
        output: {
          token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
          recipient: "0x1111111111111111111111111111111111111111",
          amount: "9900000",
          ...(minimumAmount === undefined ? {} : { minimumAmount }),
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const response = await POST(request(validBody));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "invalid_uniswap_minimum" });
  });

  it("rejects non-CLASSIC routing because order signing is not implemented", async () => {
    vi.stubEnv("UNISWAP_API_KEY", "server-secret");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", SESSION_SECRET);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      routing: "DUTCH_V3",
      quote: {
        input: { token: "0x3600000000000000000000000000000000000000", amount: "10250000" },
        output: { token: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", amount: "1" },
      },
    }), { status: 200 })));
    const response = await POST(request(validBody));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "unsupported_uniswap_route" });
  });
});
