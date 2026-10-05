"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePilotStore } from "@/store/pilot-store";
import { formatUsd } from "@/lib/utils";
import type { TransactionRecord } from "@/types";

const CHAIN_COLORS: Record<string, string> = {
  Arc: "var(--color-accent)",
  Base: "#7db9ed",
  Ethereum: "#b7a4ed",
  Arbitrum: "#edc77d",
  Other: "var(--color-muted-foreground)",
};

function shortChain(id?: string | null): string {
  if (!id) return "Other";
  if (id.includes("Arc")) return "Arc";
  if (id.includes("Base")) return "Base";
  if (id.includes("Ethereum") || id === "ETH") return "Ethereum";
  if (id.includes("Arbitrum")) return "Arbitrum";
  return id.replace(/_/g, " ").split(" ")[0] || "Other";
}

const chartTooltip = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
  boxShadow: "0 12px 28px rgba(0,0,0,.3)",
};
const tooltipText = { color: "var(--color-foreground)" };

const formatUsdc = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : "0.00";

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

function isUsdcTx(t: TransactionRecord): boolean {
  const token = String(t.token || "").trim().toUpperCase();
  const tokenOut = String(t.tokenOut || "").trim().toUpperCase();
  return (
    token === "USDC" ||
    token.startsWith("USDC") ||
    tokenOut === "USDC" ||
    tokenOut.startsWith("USDC")
  );
}

function isSuccessTx(t: TransactionRecord): boolean {
  const status = String(t.status || "").trim().toLowerCase();
  return status === "success" || status === "completed" || status === "confirmed";
}

export default function AnalyticsPage() {
  const { balances, transactions, hydrate, walletAddress, loadServerTransactions, loadDemoTransactions, refreshBalances } = usePilotStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    hydrate();
    if (walletAddress) {
      void loadServerTransactions(walletAddress);
      refreshBalances();
    }
  }, [hydrate, walletAddress, loadServerTransactions, refreshBalances]);

  const stats = useMemo(() => {
    const success = transactions.filter(isSuccessTx);
    const successRate = transactions.length === 0 ? null : (success.length / transactions.length) * 100;

    const completedUsdc = success.filter((t) => {
      if (!isUsdcTx(t)) return false;
      return parseTxAmount(t.amount) >= 0;
    });

    const volumeUsdc = completedUsdc.reduce((sum, t) => sum + parseTxAmount(t.amount), 0);
    const fees = transactions
      .map((t) => t.feeUsd)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
    const avgFee = fees.length === 0 ? null : fees.reduce((a, b) => a + b, 0) / fees.length;

    const days: { day: string; date: string; fullDate: string; volume: number; count: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const targetDateStr = d.toDateString();

      const dayTx = completedUsdc.filter((t) => {
        const txDate = parseTxDate(t.createdAt);
        return txDate ? txDate.toDateString() === targetDateStr : false;
      });

      const dayVolume = dayTx.reduce((sum, t) => sum + parseTxAmount(t.amount), 0);
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        fullDate: d.toLocaleDateString(),
        volume: Number(dayVolume.toFixed(6)),
        count: dayTx.length,
      });
    }

    const chainCounts = new Map<string, number>();
    for (const t of transactions) {
      const c = shortChain(t.toChain || t.fromChain);
      chainCounts.set(c, (chainCounts.get(c) || 0) + 1);
    }
    const chainUsage = [...chainCounts.entries()].map(([name, count]) => ({
      name,
      count,
      percentage: transactions.length ? (count / transactions.length) * 100 : 0,
      color: CHAIN_COLORS[name] || CHAIN_COLORS.Other,
    }));

    return {
      successRate,
      successCount: success.length,
      volumeUsdc,
      avgFee,
      days,
      chainUsage,
      empty: transactions.length === 0,
    };
  }, [transactions]);

  const allocation = balances.balances.map((b) => ({
    name: `${b.token} on ${b.chainLabel || String(b.chain)}`,
    value: b.usdValue,
  }));

  const hasRecentVolume = stats.days.some((day) => day.volume > 0 || day.count > 0);
  const total7dVolume = stats.days.reduce((acc, d) => acc + d.volume, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-foreground sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Built from your session transactions
            {stats.empty ? ". No transactions recorded yet." : ` · ${transactions.length} tx recorded`}
          </p>
        </div>
        {stats.empty && (
          <button
            type="button"
            onClick={() => loadDemoTransactions()}
            className="inline-flex items-center rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            Load sample activity
          </button>
        )}
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Unified balance",
            value: allocation.length ? formatUsd(balances.totalUsd) : "N/A",
            subtitle: "Latest balance snapshot",
          },
          {
            label: "Tx success rate",
            value: stats.successRate === null ? "N/A" : `${stats.successRate.toFixed(1)}%`,
            subtitle: `${stats.successCount} successful of ${transactions.length} total`,
          },
          {
            label: "Completed USDC volume",
            value: `${formatUsdc(stats.volumeUsdc)} USDC`,
            subtitle: "Total successful USDC in session",
          },
          {
            label: "Avg network fee",
            value: stats.avgFee === null ? "N/A" : formatUsd(stats.avgFee),
            subtitle: "Average fee per transaction",
          },
        ].map((s) => (
          <Card key={s.label} className="min-w-0 border-border bg-card">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="mt-2 break-words text-2xl font-semibold tabular-nums text-foreground">{s.value}</div>
              <p className="mt-2 text-xs text-muted-foreground">{s.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="min-w-0 border-border bg-card lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm text-foreground">Completed USDC volume (last 7 days)</CardTitle>
              <p className="text-xs text-muted-foreground">Successful USDC amounts by date.</p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                {formatUsdc(total7dVolume)} USDC
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5">7-day total</p>
            </div>
          </CardHeader>
          <CardContent>
            {mounted ? (
              <div className="h-64 min-h-[256px] w-full pt-2">
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={stats.days} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                      tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val))}
                    />
                    <Tooltip
                      contentStyle={chartTooltip}
                      itemStyle={tooltipText}
                      labelStyle={tooltipText}
                      labelFormatter={(_label, payload) => {
                        const item = payload?.[0]?.payload as { fullDate?: string; day?: string } | undefined;
                        return item?.fullDate ? `${item.day}, ${item.fullDate}` : String(_label);
                      }}
                      formatter={(value) => [`${formatUsdc(Number(value))} USDC`, "Completed volume"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="var(--color-accent)"
                      fill="url(#vol)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 min-h-[256px] items-center justify-center rounded-xl bg-muted/30">
                <span className="text-xs text-muted-foreground">Loading chart...</span>
              </div>
            )}

            {!hasRecentVolume && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span>No completed USDC transactions recorded in the last 7 calendar days.</span>
                {stats.empty && (
                  <button
                    type="button"
                    onClick={() => loadDemoTransactions()}
                    className="font-medium text-accent hover:underline ml-2 shrink-0"
                  >
                    Load sample activity
                  </button>
                )}
              </div>
            )}

            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-accent hover:underline">
                View daily volume breakdown
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <caption className="mb-2 text-left text-muted-foreground">
                    Completed USDC volume and transaction counts, last 7 local dates.
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-3">Date</th>
                      <th scope="col" className="py-2 pr-3">Day</th>
                      <th scope="col" className="py-2 pr-3 text-right">Volume (USDC)</th>
                      <th scope="col" className="py-2 text-right">Completed tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.days.map((day) => (
                      <tr key={day.date} className="border-b border-border/50 hover:bg-muted/30">
                        <th scope="row" className="py-2 pr-3 font-normal">{day.date}</th>
                        <td className="py-2 pr-3 text-muted-foreground">{day.day}</td>
                        <td className="py-2 pr-3 text-right font-medium text-foreground">{formatUsdc(day.volume)}</td>
                        <td className="py-2 text-right text-muted-foreground">{day.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Chain usage</CardTitle>
            <p className="text-xs text-muted-foreground">Transaction distribution by network.</p>
          </CardHeader>
          <CardContent>
            {stats.empty ? (
              <p className="flex min-h-48 items-center justify-center rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">
                No transactions recorded. Chain usage will appear when transactions are available.
              </p>
            ) : (
              <>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height={224}>
                    <PieChart accessibilityLayer={false}>
                      <Pie
                        data={stats.chainUsage}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        stroke="var(--color-card)"
                        isAnimationActive={false}
                      >
                        {stats.chainUsage.map((e) => (
                          <Cell key={e.name} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltip}
                        itemStyle={tooltipText}
                        labelStyle={tooltipText}
                        formatter={(value, name) => [`${value} transactions`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul aria-label="Chain usage counts and shares" className="mt-3 space-y-2 text-xs">
                  {stats.chainUsage.map((c) => (
                    <li key={c.name} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-foreground">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.count} / {transactions.length} tx ({c.percentage < 0.1 ? "<0.1" : c.percentage.toFixed(1)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border bg-card lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Stablecoin allocation</CardTitle>
            <p className="text-xs text-muted-foreground">Latest available balance values, in USD.</p>
          </CardHeader>
          <CardContent>
            {allocation.some((b) => b.value > 0) ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart data={allocation} accessibilityLayer={false}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={chartTooltip}
                      itemStyle={tooltipText}
                      labelStyle={tooltipText}
                      cursor={{ fill: "var(--color-muted)" }}
                      formatter={(value) => [formatUsd(Number(value)), "Value (USD)"]}
                    />
                    <Bar dataKey="value" fill="var(--color-accent)" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="flex min-h-40 items-center justify-center rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">
                {allocation.length === 0
                  ? "No balance data available. Connect your wallet and refresh balances to see allocation."
                  : "No positive stablecoin balances in the latest snapshot."}
              </p>
            )}
            {allocation.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-accent hover:underline">
                  View allocation data
                </summary>
                <table className="mt-3 w-full text-left text-xs tabular-nums">
                  <caption className="mb-2 text-left text-muted-foreground">
                    Stablecoin balances by token and network, valued in USD.
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-3">Token / network</th>
                      <th scope="col" className="py-2">Value (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.map((b, i) => (
                      <tr key={`${b.name}-${i}`} className="border-b border-border">
                        <th scope="row" className="py-2 pr-3 font-normal">{b.name}</th>
                        <td className="py-2">{formatUsd(b.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

