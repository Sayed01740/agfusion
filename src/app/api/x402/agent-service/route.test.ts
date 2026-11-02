import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

function expectDisabled(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-payment-required")).toBeNull();
  expect(response.headers.get("x-payment-enabled")).toBeNull();
  expect(response.headers.get("x-payment-token")).toBeNull();
  expect(response.headers.get("x-payment-amount")).toBeNull();
  expect(response.headers.get("x-payment-chainid")).toBeNull();
}

describe("/api/x402/agent-service fail-closed behavior", () => {
  it("does not advertise a payment challenge or payment metadata on GET", async () => {
    const response = await GET();
    expectDisabled(response);

    const body = await response.json();
    expect(body).toMatchObject({
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
    });
    expect(body).not.toHaveProperty("accepts");
    expect(body).not.toHaveProperty("payTo");
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("settlement");
    expect(body).not.toHaveProperty("paymentEnabled");
    expect(body).not.toHaveProperty("authorized");
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
    expectDisabled(response);

    const body = await response.json();
    expect(body).toMatchObject({
      error: "temporarily_unavailable",
      code: "X402_DISABLED",
    });
    expect(body).not.toHaveProperty("accepts");
    expect(body).not.toHaveProperty("payTo");
    expect(body).not.toHaveProperty("authorized");
  });
});
