import { describe, expect, it, vi } from "vitest";
import { handleRequest, type D1Database, type D1Statement, type Env } from "../../workers/quote-session-store/src/index";

const apiToken = "worker-api-token-with-at-least-thirty-two-characters";
const account = "0x1111111111111111111111111111111111111111";
const tokenHash = "a".repeat(64);

function setup(changes = 1) {
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes } });
  let statement: D1Statement;
  const bind = vi.fn(() => statement);
  statement = { bind, run } as unknown as D1Statement;
  const prepare = vi.fn().mockReturnValue(statement);
  const env: Env = { DB: { prepare } as unknown as D1Database, API_TOKEN: apiToken };
  return { env, prepare, bind, run };
}

function request(path: string, body: Record<string, unknown>, token = apiToken) {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Cloudflare D1 quote-session Worker", () => {
  it("requires bearer authentication", async () => {
    const { env } = setup();
    const response = await handleRequest(request("/v1/sessions/consume", { tokenHash, account, chainId: 5042 }, "wrong"), env);
    expect(response.status).toBe(401);
  });

  it("registers only bounded Arc quote sessions with prepared SQL", async () => {
    const { env, prepare, bind } = setup();
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const response = await handleRequest(request("/v1/sessions/register", {
      tokenHash, account, chainId: 5042, expiresAt,
    }), env);
    expect(response.status).toBe(201);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO arc_quote_sessions"));
    expect(bind).toHaveBeenCalledWith(tokenHash, account, 5042, expiresAt);
  });

  it("rejects oversized request bodies before parsing the full payload", async () => {
    const { env, prepare } = setup();
    const response = await handleRequest(request("/v1/sessions/register", {
      tokenHash, account, chainId: 5042,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      padding: "x".repeat(5000),
    }), env);
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects expired or excessively long quote sessions", async () => {
    const { env, prepare } = setup();
    const response = await handleRequest(request("/v1/sessions/register", {
      tokenHash, account, chainId: 5042, expiresAt: Math.floor(Date.now() / 1000) + 301,
    }), env);
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("uses one conditional UPDATE as the atomic consume boundary", async () => {
    const { env, prepare, bind } = setup();
    const response = await handleRequest(request("/v1/sessions/consume", {
      tokenHash, account, chainId: 5042,
    }), env);
    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("consumed_at IS NULL"));
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("expires_at > ?"));
    expect(bind).toHaveBeenCalledWith(expect.any(Number), tokenHash, account, 5042, expect.any(Number));
  });

  it("returns 409 when another request already consumed the session", async () => {
    const { env } = setup(0);
    const response = await handleRequest(request("/v1/sessions/consume", {
      tokenHash, account, chainId: 5042,
    }), env);
    expect(response.status).toBe(409);
  });

  it("fails closed if D1 throws", async () => {
    const { env, prepare } = setup();
    prepare.mockImplementation(() => { throw new Error("D1 offline"); });
    const response = await handleRequest(request("/v1/sessions/consume", {
      tokenHash, account, chainId: 5042,
    }), env);
    expect(response.status).toBe(503);
  });

  it("rejects non-Arc chain IDs and malformed hashes", async () => {
    const { env, prepare } = setup();
    const response = await handleRequest(request("/v1/sessions/consume", {
      tokenHash: "bad", account, chainId: 1,
    }), env);
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });
});
