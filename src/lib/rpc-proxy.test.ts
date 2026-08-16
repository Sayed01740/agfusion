import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARC_EXPECTED_CHAIN_ID_HEX,
  healthCheck,
  isWriteMethod,
  parseJsonRpc,
} from "./rpc-proxy";

type MockUpstream = { url: string; response: () => Promise<unknown> };

function mockFetch(upstreams: MockUpstream[]) {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = upstreams.find((u) => url.startsWith(u.url));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return hit.response();
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

function jsonRpcResponse(chainIdHex: string, ok = true): () => Promise<unknown> {
  return async () =>
    ok
      ? {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: chainIdHex }),
        }
      : { ok: false, status: 502, text: async () => "upstream down" };
}

function htmlResponse(): () => Promise<unknown> {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => "<html><body>Arc RPC</body></html>",
  });
}

function malformedJsonResponse(): () => Promise<unknown> {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => "not-json-at-all",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rpc-proxy failover (Phase 2)", () => {
  it("health check succeeds on the primary Arc upstream", async () => {
    mockFetch([
      {
        url: "https://rpc.testnet.arc.network",
        response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX),
      },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.chainId).toBe(ARC_EXPECTED_CHAIN_ID_HEX);
    expect(h.upstream).toContain("rpc.testnet.arc.network");
    expect(typeof h.latencyMs).toBe("number");
  });

  it("falls back to the next upstream when the primary fails", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.network", response: jsonRpcResponse("0x0", false) },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
  });

  it("rejects a wrong chainId upstream and uses the correct one", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.network", response: jsonRpcResponse("0x1") },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
    expect(h.chainId).toBe(ARC_EXPECTED_CHAIN_ID_HEX);
  });

  it("treats an HTTP 200 HTML response as a failure", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.network", response: htmlResponse() },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
  });

  it("treats malformed JSON as a failure", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.network", response: malformedJsonResponse() },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
  });

  it("reports failure when every upstream is down", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.network", response: jsonRpcResponse("0x0", false) },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse("0x0", false) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(false);
    expect(h.error).toBe("all_upstreams_failed");
    expect(h.tried?.length).toBeGreaterThanOrEqual(1);
  });

  it("fails safely for an unknown chain", async () => {
    const h = await healthCheck("sonic");
    expect(h.ok).toBe(false);
    expect(h.error).toBe("unknown_chain");
  });
});

describe("write-method safety (RULE 11)", () => {
  it("write methods are never fail-over candidates", () => {
    expect(isWriteMethod("eth_sendRawTransaction")).toBe(true);
    expect(isWriteMethod("personal_sign")).toBe(true);
    expect(isWriteMethod("eth_sendTransaction")).toBe(true);
    expect(isWriteMethod("eth_getBalance")).toBe(false);
    expect(isWriteMethod("eth_getTransactionReceipt")).toBe(false);
    expect(isWriteMethod("eth_call")).toBe(false);
    expect(isWriteMethod("eth_chainId")).toBe(false);
  });
});

describe("parseJsonRpc", () => {
  it("parses success and error envelopes", () => {
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"result":"0x1"}')).toEqual({
      ok: true,
      result: "0x1",
    });
    const err = parseJsonRpc(
      '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"boom"}}',
    );
    expect(err.ok).toBe(false);
    expect(err.error?.code).toBe(-32000);
  });

  it("rejects invalid JSON", () => {
    const err = parseJsonRpc("<html>not json</html>");
    expect(err.ok).toBe(false);
    expect(err.error?.code).toBe(-32700);
  });
});
