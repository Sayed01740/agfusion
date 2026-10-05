import { describe, it, expect } from "vitest";

function parseTxDate(raw?: string | number | null): Date | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    const ms = raw < 1e11 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseTxAmount(amount?: string | number | null): number {
  if (amount == null) return 0;
  if (typeof amount === "number") return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const cleaned = String(amount).replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isUsdcTx(t: { token?: string; tokenOut?: string }): boolean {
  const token = String(t.token || "").trim().toUpperCase();
  const tokenOut = String(t.tokenOut || "").trim().toUpperCase();
  return (
    token === "USDC" ||
    token.startsWith("USDC") ||
    tokenOut === "USDC" ||
    tokenOut.startsWith("USDC")
  );
}

function isSuccessTx(t: { status?: string }): boolean {
  const status = String(t.status || "").trim().toLowerCase();
  return status === "success" || status === "completed" || status === "confirmed";
}

describe("Analytics 7-day USDC Volume Computation", () => {
  it("handles various date formats safely without producing Invalid Date", () => {
    expect(parseTxDate("2026-10-05T12:00:00.000Z")?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(parseTxDate(1728123456789)?.getTime()).toBe(1728123456789);
    // numeric string timestamp (which standard new Date('1728123456789') fails to parse)
    expect(parseTxDate("1728123456789")?.getTime()).toBe(1728123456789);
    expect(parseTxDate(undefined)).toBeNull();
    expect(parseTxDate("")).toBeNull();
    expect(parseTxDate("invalid-date-string")).toBeNull();
  });

  it("handles string amounts with commas and numeric values", () => {
    expect(parseTxAmount("1,000.50")).toBe(1000.5);
    expect(parseTxAmount("50")).toBe(50);
    expect(parseTxAmount(25.5)).toBe(25.5);
    expect(parseTxAmount("")).toBe(0);
    expect(parseTxAmount(undefined)).toBe(0);
    expect(parseTxAmount("-10")).toBe(0);
  });

  it("identifies USDC tokens correctly across cases and tokenOut", () => {
    expect(isUsdcTx({ token: "USDC" })).toBe(true);
    expect(isUsdcTx({ token: "usdc" })).toBe(true);
    expect(isUsdcTx({ token: "USDC.e" })).toBe(true);
    expect(isUsdcTx({ token: "EURC", tokenOut: "USDC" })).toBe(true);
    expect(isUsdcTx({ token: "ETH" })).toBe(false);
  });

  it("identifies success and confirmed states", () => {
    expect(isSuccessTx({ status: "success" })).toBe(true);
    expect(isSuccessTx({ status: "SUCCESS" })).toBe(true);
    expect(isSuccessTx({ status: "completed" })).toBe(true);
    expect(isSuccessTx({ status: "confirmed" })).toBe(true);
    expect(isSuccessTx({ status: "error" })).toBe(false);
    expect(isSuccessTx({ status: "pending" })).toBe(false);
  });

  it("correctly groups transactions into 7 daily buckets", () => {
    const now = new Date();
    const todayIso = now.toISOString();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    const threeDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12, 0, 0);
    const tenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 12, 0, 0);

    const testTxs = [
      { id: "1", token: "USDC", amount: "100.00", status: "success", createdAt: todayIso },
      { id: "2", token: "usdc", amount: "50.00", status: "completed", createdAt: yesterday.toISOString() },
      { id: "3", token: "EURC", tokenOut: "USDC", amount: "25.00", status: "confirmed", createdAt: String(threeDaysAgo.getTime()) },
      { id: "4", token: "USDC", amount: "500.00", status: "success", createdAt: tenDaysAgo.toISOString() }, // > 7 days ago
      { id: "5", token: "USDC", amount: "10.00", status: "error", createdAt: todayIso }, // not success
    ];

    const success = testTxs.filter(isSuccessTx);
    const completedUsdc = success.filter((t) => isUsdcTx(t) && parseTxAmount(t.amount) > 0);

    const days: { dateStr: string; volume: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const targetDateStr = d.toDateString();
      const dayTx = completedUsdc.filter((t) => {
        const txDate = parseTxDate(t.createdAt);
        return txDate ? txDate.toDateString() === targetDateStr : false;
      });
      const dayVolume = dayTx.reduce((sum, t) => sum + parseTxAmount(t.amount), 0);
      days.push({ dateStr: targetDateStr, volume: dayVolume, count: dayTx.length });
    }

    expect(days).toHaveLength(7);
    // Today bucket (last element)
    expect(days[6].volume).toBe(100);
    expect(days[6].count).toBe(1);
    // Yesterday bucket (2nd to last)
    expect(days[5].volume).toBe(50);
    expect(days[5].count).toBe(1);
    // 3 days ago bucket (index 3)
    expect(days[3].volume).toBe(25);
    expect(days[3].count).toBe(1);

    const total7d = days.reduce((sum, d) => sum + d.volume, 0);
    expect(total7d).toBe(175); // 100 + 50 + 25
  });
});
