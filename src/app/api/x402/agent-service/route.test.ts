import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("/api/x402/agent-service fail-closed behavior", () => {
  it("advertises a disabled Arc Testnet USDC challenge without inviting payment", async () => {
    const response = await GET(new Request("http://localhost/api/x402/agent-service"));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(response.headers.get("X-Payment-Enabled")).toBe("false");
    expect(response.headers.get("X-Payment-Decimals")).toBe("6");
    expect(body.paymentEnabled).toBe(false);
    expect(body.settlement.chainId).toBe(5042002);
    expect(body.settlement.token).toBe(
      "0x3600000000000000000000000000000000000000",
    );
    expect(body.description).toContain("Do not send funds");
    expect(body.authorized).toBeUndefined();
  });

  it.each([
    ["fabricated transaction hash", { "x-payment-tx": "0x_session_fake" }],
    ["arbitrary session header", { "x-session-auth": "anything-at-all" }],
    [
      "both unverified headers",
      {
        "x-payment-tx": "0x" + "a".repeat(64),
        "x-session-auth": "session_authorized",
      },
    ],
  ])("does not authorize %s", async (_label, headers) => {
    const response = await POST(
      new Request("http://localhost/api/x402/agent-service", {
        method: "POST",
        headers,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Payment-Status")).toBe("Unavailable");
    expect(body.paymentEnabled).toBe(false);
    expect(body.error).toBe("payment_verification_unavailable");
    expect(body.authorized).toBeUndefined();
  });
});
