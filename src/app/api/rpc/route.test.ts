import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  forwardJsonRpc: vi.fn(),
  findHealthyUpstream: vi.fn(),
  healthCheck: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "rpc-body-regression-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/rpc-proxy", () => ({
  RPC_UPSTREAMS: { arc: ["https://rpc.example.test"] },
  chainKey: (value: string | null) => value || "arc",
  findHealthyUpstream: mocks.findHealthyUpstream,
  forwardJsonRpc: mocks.forwardJsonRpc,
  healthCheck: mocks.healthCheck,
  isReadMethod: (method: string) => ["eth_blockNumber", "eth_chainId"].includes(method),
  isWriteMethod: (method: string) => [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_signTypedData_v3",
    "wallet_sendCalls",
    "eth_sendUserOperation",
  ].includes(method),
  parseJsonRpc: (value: string) => ({ ok: true, ...JSON.parse(value) }),
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/rpc request-body limit and compatibility", () => {
  it("rejects oversized bodies before forwarding to any RPC upstream", async () => {
    const response = await POST(new Request("http://localhost/api/rpc?chain=arc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [], note: "x".repeat(129 * 1024) }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32005, message: "RPC request body too large" },
    });
    expect(mocks.forwardJsonRpc).not.toHaveBeenCalled();
  });


  it("rejects JSON-RPC batches before any upstream is contacted", async () => {
    const body = JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: ["0x1234"] },
    ]);
    const response = await POST(new Request("http://localhost/api/rpc?chain=arc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "JSON-RPC batch requests are not supported" },
    });
    expect(mocks.forwardJsonRpc).not.toHaveBeenCalled();
    expect(mocks.findHealthyUpstream).not.toHaveBeenCalled();
  });

  it("rejects unknown methods instead of treating them as retryable reads", async () => {
    const response = await POST(new Request("http://localhost/api/rpc?chain=arc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "eth_unrecognizedMethod", params: [] }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32601);
    expect(mocks.forwardJsonRpc).not.toHaveBeenCalled();
    expect(mocks.findHealthyUpstream).not.toHaveBeenCalled();
  });

  it("routes a supported signing method through the single-attempt path", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "eth_signTypedData_v3", params: [] });
    mocks.findHealthyUpstream.mockResolvedValue({
      upstream: "https://rpc.example.test",
      chainId: "0x4cef52",
    });
    mocks.forwardJsonRpc.mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({ jsonrpc: "2.0", id: 9, result: "0xsigned" }),
    });

    const response = await POST(new Request("http://localhost/api/rpc?chain=arc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(200);
    expect(mocks.findHealthyUpstream).toHaveBeenCalledOnce();
    expect(mocks.forwardJsonRpc).toHaveBeenCalledOnce();
    expect(mocks.forwardJsonRpc).toHaveBeenCalledWith("https://rpc.example.test", body);
  });

  it("forwards a valid read-only JSON-RPC request unchanged and preserves the response", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "eth_blockNumber", params: [] });
    mocks.forwardJsonRpc.mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({ jsonrpc: "2.0", id: 7, result: "0x123" }),
    });

    const response = await POST(new Request("http://localhost/api/rpc?chain=arc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 7, result: "0x123" });
    expect(mocks.forwardJsonRpc).toHaveBeenCalledTimes(1);
    expect(mocks.forwardJsonRpc).toHaveBeenCalledWith("https://rpc.example.test", body);
  });
});
