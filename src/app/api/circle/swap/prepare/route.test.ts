import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "swap-route-test",
  rateLimit: () => ({ ok: true }),
}));

vi.mock("@/lib/circle-kit-server", () => ({
  getServerKitKey: () => undefined,
}));

import { POST } from "@/app/api/circle/swap/prepare/route";
import { MAINNET_SWAP_NOT_READY_MESSAGE } from "@/lib/mainnet-swap-readiness";

function requestFor(chainId: number) {
  return new Request("http://localhost/api/circle/swap/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: "0x0000000000000000000000000000000000000001",
      amount: "1",
      tokenIn: "USDC",
      tokenOut: "EURC",
      chainId,
    }),
  });
}

describe("POST /api/circle/swap/prepare chain readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects Arc Mainnet before Circle SDK initialization while readiness is false", async () => {
    const response = await POST(requestFor(5042));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: MAINNET_SWAP_NOT_READY_MESSAGE,
    });
  });

  it("does not reject Arc Testnet at the Mainnet readiness gate", async () => {
    const response = await POST(requestFor(5042002));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Circle App Kit is not configured on the server.",
    });
  });
});
