import { describe, expect, it } from "vitest";
import { getUsdc, requireChain, buildTxExplorerUrl } from "@/onchain-facts";
import {
  parseUsdc,
  formatUsdc,
  parseGasAmount,
  formatGasAmount,
  usdcDecimalsFor,
  usdcToGasToken,
  gasTokenToUsdc,
  USDC_ERC20_DECIMALS,
  ARC_NATIVE_GAS_DECIMALS,
} from "@/onchain-money";

describe("Arc Standard Rules - onchain-facts", () => {
  it("resolves Arc Testnet facts accurately", () => {
    const chain = requireChain(5042002);
    expect(chain.chainId).toBe(5042002);
    expect(chain.name).toBe("Arc Testnet");
    expect(chain.nativeCurrency.decimals).toBe(18);
    expect(chain.usdc.decimals).toBe(6);
    expect(chain.usdc.address.toLowerCase()).toBe("0x3600000000000000000000000000000000000000");
  });

  it("reads getUsdc helper correctly", () => {
    const usdc = getUsdc(5042002);
    expect(usdc.decimals).toBe(6);
    expect(usdc.address.toLowerCase()).toBe("0x3600000000000000000000000000000000000000");
  });

  it("builds transaction explorer URLs", () => {
    const url = buildTxExplorerUrl(5042002, "0x123abc");
    expect(url).toContain("/tx/0x123abc");
  });
});

describe("Arc Standard Rules - onchain-money", () => {
  it("RULE 1: parses user USDC in 6-decimal ERC-20 view", () => {
    const parsed = parseUsdc("10.50");
    expect(parsed.raw).toBe(10_500_000n);
    expect(parsed.formatted).toBe("10.5");
    expect(formatUsdc(10_500_000n)).toBe("10.5");
  });

  it("RULE 1: parses gas amounts in 18-decimal native view", () => {
    const parsed = parseGasAmount("1.0");
    expect(parsed.raw).toBe(1_000_000_000_000_000_000n);
    expect(formatGasAmount(1_000_000_000_000_000_000n)).toBe("1");
  });

  it("converts between 6-decimal and 18-decimal views", () => {
    const erc20 = 10_000_000n; // 10 USDC (6 dec)
    const native = usdcToGasToken(erc20); // 10 * 10^18
    expect(native).toBe(10_000_000_000_000_000_000n);
    expect(gasTokenToUsdc(native)).toBe(erc20);
  });

  it("returns decimals according to view", () => {
    expect(usdcDecimalsFor("erc20")).toBe(USDC_ERC20_DECIMALS);
    expect(usdcDecimalsFor("native")).toBe(ARC_NATIVE_GAS_DECIMALS);
  });

  it("rejects negative or invalid input values", () => {
    expect(() => parseUsdc("-5")).toThrow();
    expect(() => parseUsdc("abc")).toThrow();
  });
});
