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
  isWriteMethod: (method: string) => method.startsWith("eth_send") || method.startsWith("personal_"),
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
