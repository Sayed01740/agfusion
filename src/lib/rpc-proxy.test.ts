import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARC_EXPECTED_CHAIN_ID_HEX,
  healthCheck,
  isReadMethod,
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
        url: "https://rpc.testnet.arc.io",
        response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX),
      },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.chainId).toBe(ARC_EXPECTED_CHAIN_ID_HEX);
    expect(h.upstream).toContain("rpc.testnet.arc.io");
    expect(typeof h.latencyMs).toBe("number");
  });

  it("falls back to the next upstream when the primary fails", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.io", response: jsonRpcResponse("0x0", false) },
      { url: "https://rpc.testnet.arc.network", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("rpc.testnet.arc.network");
  });

  it("rejects a wrong chainId upstream and uses the correct one", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.io", response: jsonRpcResponse("0x1") },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
    expect(h.chainId).toBe(ARC_EXPECTED_CHAIN_ID_HEX);
  });

  it("treats an HTTP 200 HTML response as a failure", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.io", response: htmlResponse() },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
  });

  it("treats malformed JSON as a failure", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.io", response: malformedJsonResponse() },
      { url: "https://rpc.blockdaemon.testnet.arc.io", response: jsonRpcResponse(ARC_EXPECTED_CHAIN_ID_HEX) },
    ]);
    const h = await healthCheck("arc");
    expect(h.ok).toBe(true);
    expect(h.upstream).toContain("blockdaemon");
  });

  it("reports failure when every upstream is down", async () => {
    mockFetch([
      { url: "https://rpc.testnet.arc.io", response: jsonRpcResponse("0x0", false) },
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

describe("RPC method classification", () => {
  it("classifies common state-changing and signing methods as non-retryable", () => {
    for (const method of [
      "eth_sendRawTransaction",
      "eth_sendRawTransactionConditional",
      "eth_sendTransaction",
      "eth_sendPrivateTransaction",
      "eth_sendBundle",
      "eth_sendUserOperation",
      "eth_sign",
      "eth_signTransaction",
      "eth_signTypedData",
      "eth_signTypedData_v1",
      "eth_signTypedData_v3",
      "eth_signTypedData_v4",
      "personal_sign",
      "wallet_sendCalls",
    ]) {
      expect(isWriteMethod(method), method).toBe(true);
      expect(isReadMethod(method), method).toBe(false);
    }
  });

  it("allows only explicitly listed read methods to use failover", () => {
    for (const method of [
      "eth_blockNumber",
      "eth_call",
      "eth_chainId",
      "eth_estimateGas",
      "eth_getBalance",
      "eth_getLogs",
      "eth_getTransactionReceipt",
      "eth_getTransactionCount",
      "eth_getUserOperationReceipt",
      "wallet_getCapabilities",
    ]) {
      expect(isReadMethod(method), method).toBe(true);
      expect(isWriteMethod(method), method).toBe(false);
    }
  });

  it("leaves unknown methods unclassified so the route can reject them", () => {
    expect(isReadMethod("eth_unknownDangerousMethod")).toBe(false);
    expect(isWriteMethod("eth_unknownDangerousMethod")).toBe(false);
    expect(isReadMethod("wallet_unknownMethod")).toBe(false);
    expect(isReadMethod("eth_accounts")).toBe(false);
    expect(isReadMethod("eth_requestAccounts")).toBe(false);
    expect(isWriteMethod("wallet_unknownMethod")).toBe(false);
    // Filter creation and polling are stateful/non-idempotent, so they are not retryable reads.
    expect(isReadMethod("eth_newFilter")).toBe(false);
    expect(isReadMethod("eth_getFilterChanges")).toBe(false);
    expect(isReadMethod("eth_getFilterLogs")).toBe(false);
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
