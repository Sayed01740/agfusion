import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const preflight = vi.hoisted(() => ({
  read: vi.fn(),
  approval: vi.fn(),
}));

vi.mock("@/blockchain/uniswap-permit2-preflight", () => ({
  ARC_MAINNET_SWAP_TOKENS: {
    USDC: "0x3600000000000000000000000000000000000000",
    EURC: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    cirBTC: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
  },
  readArcMainnetPermit2Preflight: preflight.read,
  buildExactPermit2Approval: preflight.approval,
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "uniswap-preflight-test",
  rateLimit: () => ({ ok: true }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function request(body: unknown) {
  return new Request("http://localhost/api/uniswap/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  address: "0x1111111111111111111111111111111111111111",
  tokenIn: "USDC",
  amount: "1.25",
  chainId: 5042,
};

describe("POST /api/uniswap/preflight", () => {
  it("rejects invalid wallet, chain, token and amount before RPC", async () => {
    expect((await POST(request({ ...validBody, address: "bad" }))).status).toBe(400);
    expect((await POST(request({ ...validBody, chainId: 1 }))).status).toBe(400);
    expect((await POST(request({ ...validBody, tokenIn: "UNKNOWN" }))).status).toBe(400);
    expect((await POST(request({ ...validBody, amount: "1.0000001" }))).status).toBe(400);
    expect(preflight.read).not.toHaveBeenCalled();
  });

  it("returns read-only allowance and balance results plus exact approval calldata when required", async () => {
    preflight.read.mockResolvedValue({
      chainId: 5042,
      account: validBody.address,
      token: "0x3600000000000000000000000000000000000000",
      amount: 1_250_000n,
      tokenBalance: 5_000_000n,
      nativeGasBalance: 20_000_000_000_000_000n,
      erc20AllowanceToPermit2: 0n,
      permit2AllowanceToRouter: 0n,
      permit2Expiration: 0,
      permit2Nonce: 4,
      hasTokenBalance: true,
      hasGasReserve: true,
      requiresErc20Approval: true,
      requiresPermit2Signature: true,
      readyForSwapAfterPermit: false,
    });
    preflight.approval.mockReturnValue({
      chainId: 5042,
      from: validBody.address,
      to: "0x3600000000000000000000000000000000000000",
      data: "0x095ea7b300",
      value: "0",
      spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      amount: 1_250_000n,
    });

    const response = await POST(request(validBody));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      chainId: 5042,
      tokenBalance: "5",
      hasTokenBalance: true,
      hasGasReserve: true,
      requiresErc20Approval: true,
      requiresPermit2Signature: true,
      approvalTransaction: {
        chainId: 5042,
        data: "0x095ea7b300",
        amount: "1250000",
      },
    });
    expect(preflight.read).toHaveBeenCalledOnce();
    expect(preflight.approval).toHaveBeenCalledWith(
      validBody.address,
      "0x3600000000000000000000000000000000000000",
      1_250_000n,
    );
  });

  it("returns no approval transaction when existing ERC-20 allowance is sufficient", async () => {
    preflight.read.mockResolvedValue({
      chainId: 5042,
      account: validBody.address,
      token: "0x3600000000000000000000000000000000000000",
      amount: 1_250_000n,
      tokenBalance: 5_000_000n,
      nativeGasBalance: 20_000_000_000_000_000n,
      erc20AllowanceToPermit2: 2_000_000n,
      permit2AllowanceToRouter: 0n,
      permit2Expiration: 0,
      permit2Nonce: 4,
      hasTokenBalance: true,
      hasGasReserve: true,
      requiresErc20Approval: false,
      requiresPermit2Signature: true,
      readyForSwapAfterPermit: true,
    });
    const response = await POST(request(validBody));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.approvalTransaction).toBeNull();
    expect(preflight.approval).not.toHaveBeenCalled();
  });
});
