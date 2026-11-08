import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeArcQuoteSession, registerArcQuoteSession } from "./arc-quote-session-store";

const token = "opaque-session-token-that-is-long-enough-for-storage";
const account = "0x1111111111111111111111111111111111111111";
const apiToken = "worker-api-token-with-at-least-thirty-two-characters";
const baseUrl = "https://quote-store.example.workers.dev";

function configure() {
  vi.stubEnv("AGFUSION_QUOTE_SESSION_STORE_URL", baseUrl);
  vi.stubEnv("AGFUSION_QUOTE_SESSION_STORE_TOKEN", apiToken);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("D1-backed Arc quote-session replay guard", () => {
  it("fails closed when Worker configuration is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(registerArcQuoteSession({
      token, account, chainId: 5042, expiresAt: Math.floor(Date.now() / 1000) + 60,
    })).resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the SHA-256 digest and normalized account to the Worker", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    await expect(registerArcQuoteSession({
      token, account: account.toUpperCase().replace("0X", "0x"), chainId: 5042, expiresAt,
    })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init.body));
    expect(url).toBe(`${baseUrl}/v1/sessions/register`);
    expect(init.headers.Authorization).toBe(`Bearer ${apiToken}`);
    expect(payload.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.tokenHash).not.toBe(token);
    expect(payload).toMatchObject({ account, chainId: 5042, expiresAt });
  });

  it("atomically consumes a quote session through the Worker endpoint", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042 }))
      .resolves.toEqual({ ok: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${baseUrl}/v1/sessions/consume`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      account, chainId: 5042, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects replay and concurrent losers on HTTP 409", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042 }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
  });

  it("fails closed on Worker outages and timeouts", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042 }))
      .resolves.toEqual({ ok: false, reason: "database_unavailable" });
  });

  it("rejects invalid bindings before making a network request", async () => {
    configure();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(consumeArcQuoteSession({ token, account, chainId: 1 }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
    await expect(consumeArcQuoteSession({ token, account: "bad", chainId: 5042 }))
      .resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS Worker endpoints", async () => {
    vi.stubEnv("AGFUSION_QUOTE_SESSION_STORE_URL", "http://insecure.example");
    vi.stubEnv("AGFUSION_QUOTE_SESSION_STORE_TOKEN", apiToken);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(consumeArcQuoteSession({ token, account, chainId: 5042 }))
      .resolves.toEqual({ ok: false, reason: "database_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
