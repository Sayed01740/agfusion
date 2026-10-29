import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getServerKitKey: vi.fn(() => "test-kit-key"),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "circle-proxy-regression-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/circle-kit-server", () => ({
  getServerKitKey: mocks.getServerKitKey,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.getServerKitKey.mockReturnValue("test-kit-key");
});

describe("POST /api/circle/proxy valid request compatibility", () => {
  it("forwards an in-limit JSON body unchanged to the allowlisted Circle endpoint", async () => {
    const body = JSON.stringify({
      source: { chain: "Arc_Testnet", token: "USDC", amount: "1" },
      destination: { chain: "Arc_Testnet", token: "EURC" },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "quote-test", status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request(
      "http://localhost/api/circle/proxy?path=%2Fv1%2FstablecoinKits%2Fswap",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "quote-test", status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.circle.com/v1/stablecoinKits/swap");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-kit-key");
  });

  it("rejects malformed JSON without making an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request(
      "http://localhost/api/circle/proxy?path=%2Fv1%2FstablecoinKits%2Fswap",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
