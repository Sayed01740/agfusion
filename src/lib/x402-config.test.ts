import { afterEach, describe, expect, it, vi } from "vitest";
import { getX402Recipient } from "./x402-config";

afterEach(() => vi.unstubAllEnvs());

describe("getX402Recipient", () => {
  it("requires the server-only variable and ignores the public variable", () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "");
    vi.stubEnv("NEXT_PUBLIC_AGFUSION_REGISTRY", "0x1111111111111111111111111111111111111111");
    expect(getX402Recipient()).toEqual({ ok: false, reason: "missing_recipient" });
  });

  it("rejects malformed server configuration", () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "not-an-address");
    expect(getX402Recipient()).toEqual({ ok: false, reason: "invalid_recipient" });
  });

  it("normalizes a valid server-only recipient", () => {
    vi.stubEnv("AGFUSION_X402_RECIPIENT", "  0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  ");
    expect(getX402Recipient()).toEqual({
      ok: true,
      recipient: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });
});
