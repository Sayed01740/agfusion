import { describe, expect, it } from "vitest";
import { collectTransactions } from "@/lib/bounded-transaction-collector";

const validTx = (n: number) => ({
  to: `0x${n.toString(16).padStart(40, "0")}`,
  data: "0x1234",
});

describe("collectTransactions", () => {
  it("collects unique valid transaction objects from nested SDK estimates", () => {
    expect(collectTransactions({ steps: [validTx(1), { nested: validTx(2) }] })).toEqual([
      validTx(1),
      validTx(2),
    ]);
  });

  it("deduplicates the same transaction", () => {
    expect(collectTransactions([validTx(1), validTx(1)])).toEqual([validTx(1)]);
  });

  it("ignores malformed transaction fields", () => {
    expect(collectTransactions([{ to: "not-an-address", data: "0x12" }])).toEqual([]);
  });

  it("caps the number of returned transactions at 64", () => {
    expect(collectTransactions(Array.from({ length: 100 }, (_, i) => validTx(i + 1)))).toHaveLength(64);
  });

  it("bounds traversal of deeply nested values without throwing", () => {
    let value: unknown = validTx(1);
    for (let i = 0; i < 100; i += 1) value = { child: value };
    expect(() => collectTransactions(value)).not.toThrow();
    expect(collectTransactions(value)).toEqual([]);
  });

  it("bounds traversal of a very broad array", () => {
    const value = Array.from({ length: 10_000 }, () => ({ irrelevant: true }));
    expect(collectTransactions(value)).toEqual([]);
  });
});
