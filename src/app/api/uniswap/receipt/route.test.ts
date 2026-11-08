import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/blockchain/uniswap-quote-session", () => ({
  decryptArcUniswapReceiptTicket: mocks.decrypt,
}));
vi.mock("@/blockchain/uniswap-receipt-verification", () => ({
  verifyArcMainnetSwapReceipt: mocks.verify,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "uniswap-receipt-test",
  rateLimit: () => ({ ok: true }),
}));

afterEach(() => vi.clearAllMocks());

const ticket = {
  version: 1,
  purpose: "receipt-verification",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_086_400,
  chainId: 5042,
  account: "0x1111111111111111111111111111111111111111",
  tokenIn: "0x3600000000000000000000000000000000000000",
  tokenOut: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  amountIn: "1000000",
  minimumAmountOut: "891000",
};

function request(body: unknown) {
  return new Request("http://localhost/api/uniswap/receipt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const hash = "0x" + "11".repeat(32);

describe("POST /api/uniswap/receipt", () => {
  it("rejects missing ticket and malformed transaction hash", async () => {
    expect((await POST(request({ transactionHash: hash }))).status).toBe(400);
    mocks.decrypt.mockReturnValue(ticket);
    expect((await POST(request({ receiptVerificationTicket: "ticket", transactionHash: "bad" }))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns pending while the transaction is not yet indexed", async () => {
    mocks.decrypt.mockReturnValue(ticket);
    mocks.verify.mockRejectedValue(Object.assign(new Error("not found"), { name: "TransactionReceiptNotFoundError" }));
    const response = await POST(request({ receiptVerificationTicket: "ticket", transactionHash: hash }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: false, status: "pending" });
  });

  it("returns verified on exact input and minimum output transfer proof", async () => {
    mocks.decrypt.mockReturnValue(ticket);
    mocks.verify.mockResolvedValue({
      verified: true,
      chainId: 5042,
      transactionHash: hash,
      blockNumber: 123n,
      from: ticket.account,
      to: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
      status: "success",
      inputSpent: 1_000_000n,
      outputReceived: 900_000n,
    });
    const response = await POST(request({ receiptVerificationTicket: "ticket", transactionHash: hash }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      verified: true,
      chainId: 5042,
      inputSpent: "1000000",
      outputReceived: "900000",
      blockNumber: "123",
    });
    expect(mocks.verify).toHaveBeenCalledWith({
      hash,
      account: ticket.account,
      tokenIn: ticket.tokenIn,
      tokenOut: ticket.tokenOut,
      amountIn: 1_000_000n,
      minimumAmountOut: 891_000n,
    });
  });

  it("does not treat reverted or mismatched receipts as verified", async () => {
    mocks.decrypt.mockReturnValue(ticket);
    mocks.verify.mockRejectedValue(new Error("Arc Mainnet receipt verification failed: transaction reverted"));
    const response = await POST(request({ receiptVerificationTicket: "ticket", transactionHash: hash }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "receipt_verification_failed" });
  });
});
