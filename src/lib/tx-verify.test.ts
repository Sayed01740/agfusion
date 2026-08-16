import { describe, expect, it } from "vitest";
import { isValidTxHash, verifyReceiptOnChain } from "./tx-verify";

const TX = "0x" + "ab".repeat(32);

function receiptResponse(statusHex: string | null, delayCalls = 0) {
  let calls = 0;
  return async () => {
    calls += 1;
    if (delayCalls > 0 && calls <= delayCalls) {
      return { ok: true, status: 200, json: async () => ({ result: null }) };
    }
    if (statusHex === null) {
      return { ok: true, status: 200, json: async () => ({ result: null }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: { status: statusHex, blockNumber: "0x10" },
      }),
    };
  };
}

describe("verifyReceiptOnChain (Phase 5)", () => {
  it("accepts a valid tx hash shape", () => {
    expect(isValidTxHash(TX)).toBe(true);
    expect(isValidTxHash("0x123")).toBe(false);
    expect(isValidTxHash("123")).toBe(false);
    // Mixed-case hex digits with the canonical lowercase 0x prefix are fine.
    expect(isValidTxHash("0x" + "Ab".repeat(32))).toBe(true);
    // Uppercased 0X prefix is not a canonical hash.
    expect(isValidTxHash(TX.toUpperCase())).toBe(false);
  });

  it("returns success for status 0x1", async () => {
    const v = await verifyReceiptOnChain({
      chainKey: "arc",
      txHash: TX,
      attempts: 1,
      fetchImpl: receiptResponse("0x1") as unknown as typeof fetch,
    });
    expect(v.status).toBe("success");
  });

  it("returns reverted for status 0x0", async () => {
    const v = await verifyReceiptOnChain({
      chainKey: "arc",
      txHash: TX,
      attempts: 1,
      fetchImpl: receiptResponse("0x0") as unknown as typeof fetch,
    });
    expect(v.status).toBe("reverted");
  });

  it("polls while pending and succeeds once mined", async () => {
    const v = await verifyReceiptOnChain({
      chainKey: "arc",
      txHash: TX,
      attempts: 3,
      delayMs: 1,
      fetchImpl: receiptResponse("0x1", 1) as unknown as typeof fetch,
    });
    expect(v.status).toBe("success");
  });

  it("returns not_found when the receipt never appears", async () => {
    const v = await verifyReceiptOnChain({
      chainKey: "arc",
      txHash: TX,
      attempts: 2,
      delayMs: 1,
      fetchImpl: receiptResponse(null) as unknown as typeof fetch,
    });
    expect(v.status).toBe("not_found");
  });

  it("throws on a malformed hash instead of guessing", async () => {
    await expect(
      verifyReceiptOnChain({
        chainKey: "arc",
        txHash: "0xnotahash",
        attempts: 1,
        fetchImpl: receiptResponse("0x1") as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/invalid transaction hash/i);
  });

  it("throws when the RPC layer fails (no silent null)", async () => {
    await expect(
      verifyReceiptOnChain({
        chainKey: "arc",
        txHash: TX,
        attempts: 1,
        fetchImpl: (async () => ({
          ok: false,
          status: 502,
          json: async () => ({ error: { message: "upstream down" } }),
        })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/failed/i);
  });
});
