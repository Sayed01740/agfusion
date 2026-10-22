import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import {
  formatArcNativeUsdcBalance,
  hasEnoughArcUsdcBalance,
} from "./live-send";

describe("Arc native USDC balance units", () => {
  it("formats native balances from 18 decimals into human USDC", () => {
    expect(formatArcNativeUsdcBalance(parseUnits("100.25", 18))).toBe("100.25");
  });

  it("accepts the send amount plus a 0.005 USDC gas reserve", () => {
    expect(hasEnoughArcUsdcBalance(parseUnits("1.005", 18), "1")).toBe(true);
    expect(hasEnoughArcUsdcBalance(parseUnits("1.004999", 18), "1")).toBe(false);
  });

  it("rejects a wallet whose balance cannot cover amount and reserve", () => {
    expect(hasEnoughArcUsdcBalance(parseUnits("0.99", 18), "1")).toBe(false);
  });
});
