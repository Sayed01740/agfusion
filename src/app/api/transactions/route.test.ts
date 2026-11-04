import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  persistTransaction: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "transactions-body-limit-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/tx-store", () => ({
  listTransactions: vi.fn(),
  persistTransaction: mocks.persistTransaction,
}));
vi.mock("@/lib/db", () => ({ isDbConfigured: vi.fn(() => true) }));

afterEach(() => vi.clearAllMocks());

describe("POST /api/transactions request-body limit", () => {
  it("rejects oversized bodies before session lookup or persistence", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(17 * 1024) }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.persistTransaction).not.toHaveBeenCalled();
  });

  it("persists a valid in-limit transaction using the existing response contract", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    mocks.persistTransaction.mockResolvedValue("saved-tx-id");

    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client-tx-regression",
        type: "bridge",
        status: "pending",
        amount: "1",
        token: "USDC",
        fromChain: "Arc_Testnet",
        toChain: "Base_Sepolia",
        stepsJson: JSON.stringify([{ name: "Bridge approval", state: "success", txHash: "0xabc123" }]),
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, saved: true });
    expect(mocks.persistTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.persistTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "client-tx-regression",
        type: "bridge",
        status: "pending",
        amount: "1",
        token: "USDC",
        steps: [{ name: "Bridge approval", state: "success", txHash: "0xabc123" }],
      }),
      expect.objectContaining({
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
    );
  });


  it.each([
    ["malformed steps JSON", "{"],
    ["non-array steps payload", JSON.stringify({ name: "not-an-array" })],
    ["unknown step state", JSON.stringify([{ name: "step", state: "finished" }])],
    ["too many steps", JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ name: `step-${i}`, state: "pending" })))],
  ])("rejects invalid stepsJson (%s) before session lookup or persistence", async (_label, stepsJson) => {
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "invalid-steps",
        type: "bridge",
        status: "pending",
        amount: "1",
        token: "USDC",
        stepsJson,
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.persistTransaction).not.toHaveBeenCalled();
  });

  it("rejects stepsJson exceeding its field-specific byte-safe character cap", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "oversized-steps",
        type: "bridge",
        status: "pending",
        amount: "1",
        token: "USDC",
        stepsJson: "x".repeat(8193),
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.persistTransaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.persistTransaction).not.toHaveBeenCalled();
  });
});
