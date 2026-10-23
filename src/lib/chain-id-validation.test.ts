import { describe, expect, it } from "vitest";
import { matchesExpectedChainId } from "@/lib/chain-id-validation";

describe("matchesExpectedChainId", () => {
  it("accepts the expected hexadecimal or decimal chain ID", () => {
    expect(matchesExpectedChainId("0x13b2", 5042)).toBe(true);
    expect(matchesExpectedChainId("5042", 5042)).toBe(true);
    expect(matchesExpectedChainId(5042, 5042)).toBe(true);
  });

  it("rejects mismatched, malformed, and unsafe chain IDs", () => {
    expect(matchesExpectedChainId("0x4cef52", 5042)).toBe(false);
    expect(matchesExpectedChainId("not-a-chain", 5042)).toBe(false);
    expect(matchesExpectedChainId("", 5042)).toBe(false);
    expect(matchesExpectedChainId("0x", 5042)).toBe(false);
    expect(matchesExpectedChainId("0x13b2garbage", 5042)).toBe(false);
    expect(matchesExpectedChainId("999999999999999999999999", 5042)).toBe(false);
  });
});
