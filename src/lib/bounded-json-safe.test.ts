import { describe, expect, it } from "vitest";
import { boundedJsonSafe } from "@/lib/bounded-json-safe";

describe("boundedJsonSafe", () => {
  it("converts bigint values to strings", () => {
    expect(boundedJsonSafe({ amount: 12n })).toEqual({ amount: "12" });
  });

  it("caps broad arrays", () => {
    const result = boundedJsonSafe(Array.from({ length: 300 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(257);
    expect(result[256]).toBe("[Truncated]");
  });

  it("caps object keys", () => {
    const value = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, i]));
    const result = boundedJsonSafe(value) as Record<string, unknown>;
    expect(result.__truncated).toBe(true);
    expect(Object.keys(result).length).toBeLessThanOrEqual(257);
  });

  it("handles circular references", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(boundedJsonSafe(value)).toEqual({ self: "[Circular]" });
  });

  it("bounds deep nesting", () => {
    let value: unknown = "end";
    for (let i = 0; i < 40; i += 1) value = { child: value };
    let current = boundedJsonSafe(value) as Record<string, unknown>;
    for (let i = 0; i < 24; i += 1) current = current.child as Record<string, unknown>;
    expect(current.child).toBe("[Truncated]");
  });

  it("bounds excessively long strings", () => {
    const result = boundedJsonSafe("x".repeat(300_000)) as string;
    expect(result.length).toBe(262144 + "[Truncated]".length);
    expect(result.endsWith("[Truncated]")).toBe(true);
  });
});
