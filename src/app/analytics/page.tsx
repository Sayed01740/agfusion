"use client";

import { useEffect, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePilotStore } from "@/store/pilot-store";
import { formatUsd } from "@/lib/utils";

const CHAIN_COLORS: Record<string, string> = { Arc: "var(--color-accent)", Base: "#7db9ed", Ethereum: "#b7a4ed", Arbitrum: "#edc77d", Other: "var(--color-muted-foreground)" };
function shortChain(id?: string | null): string { if (!id) return "Other"; if (id.includes("Arc")) return "Arc"; if (id.includes("Base")) return "Base"; if (id.includes("Ethereum") || id === "ETH") return "Ethereum"; if (id.includes("Arbitrum")) return "Arbitrum"; return id.replace(/_/g, " ").split(" ")[0] || "Other"; }

const chartTooltip = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-foreground)", boxShadow: "0 12px 28px rgba(0,0,0,.3)" };
const tooltipText = { color: "var(--color-foreground)" };
const formatUsdc = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 6 });

export default function AnalyticsPage() {
  const { balances, transactions, hydrate, walletAddress, loadServerTransactions, refreshBalances } = usePilotStore();
  useEffect(() => { hydrate(); if (walletAddress) { void loadServerTransactions(walletAddress); refreshBalances(); } }, [hydrate, walletAddress, loadServerTransactions, refreshBalances]);

  const stats = useMemo(() => {
    const success = transactions.filter((t) => t.status === "success");
    const successRate = transactions.length === 0 ? null : (success.length / transactions.length) * 100;
    const completedUsdc = success.filter((t) => t.token.toUpperCase() === "USDC" && t.amount.trim() !== "" && Number.isFinite(Number(t.amount)) && Number(t.amount) >= 0);
    const volumeUsdc = completedUsdc.reduce((sum, t) => sum + Number(t.amount), 0);
    const fees = transactions.map((t) => t.feeUsd).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
    const avgFee = fees.length === 0 ? null : fees.reduce((a, b) => a + b, 0) / fees.length;
    const days: { day: string; date: string; volume: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dayTx = completedUsdc.filter((t) => new Date(t.createdAt).toDateString() === d.toDateString());
      days.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), date: d.toLocaleDateString(), volume: dayTx.reduce((sum, t) => sum + Number(t.amount), 0), count: dayTx.length });
    }
    const chainCounts = new Map<string, number>();
    for (const t of transactions) { const c = shortChain(t.toChain || t.fromChain); chainCounts.set(c, (chainCounts.get(c) || 0) + 1); }
    const chainUsage = [...chainCounts.entries()].map(([name, count]) => ({ name, count, percentage: (count / transactions.length) * 100, color: CHAIN_COLORS[name] || CHAIN_COLORS.Other }));
    return { successRate, successCount: success.length, volumeUsdc, avgFee, days, chainUsage, empty: transactions.length === 0 };
  }, [transactions]);

  const allocation = balances.balances.map((b) => ({ name: `${b.token} on ${b.chainLabel || String(b.chain)}`, value: b.usdValue }));
  const hasRecentVolume = stats.days.some((day) => day.count > 0);

  return <div className="mx-auto max-w-7xl px-4 py-6 text-foreground sm:px-6 sm:py-8">
    <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1><p className="mt-1 text-sm text-muted-foreground">Built from your session transactions{stats.empty ? ". No transactions recorded yet." : ` · ${transactions.length} tx recorded`}</p></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "Unified balance", value: allocation.length ? formatUsd(balances.totalUsd) : "N/A", subtitle: "Latest balance snapshot" },
        { label: "Tx success rate", value: stats.successRate === null ? "N/A" : `${stats.successRate.toFixed(1)}%`, subtitle: `${stats.successCount} successful of ${transactions.length} total` },
        { label: "Completed USDC volume", value: `${formatUsdc(stats.volumeUsdc)} USDC`, subtitle: "Total successful USDC in session" },
        { label: "Avg network fee", value: stats.avgFee === null ? "N/A" : formatUsd(stats.avgFee), subtitle: "Average fee per transaction" },
      ].map((s) => <Card key={s.label} className="min-w-0 border-border bg-card"><CardContent className="p-5"><div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div><div className="mt-2 break-words text-2xl font-semibold tabular-nums text-foreground">{s.value}</div><p className="mt-2 text-xs text-muted-foreground">{s.subtitle}</p></CardContent></Card>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="min-w-0 border-border bg-card lg:col-span-3">
        <CardHeader><CardTitle className="text-sm text-foreground">Completed USDC volume (last 7 days)</CardTitle><p className="text-xs text-muted-foreground">Successful USDC amounts by date.</p></CardHeader>
        <CardContent>
          {hasRecentVolume ? <div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.days} accessibilityLayer={false}>
              <defs><linearGradient id="vol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} /><XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} /><YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={chartTooltip} itemStyle={tooltipText} labelStyle={tooltipText} formatter={(value) => [`${formatUsdc(Number(value))} USDC`, "Completed volume"]} />
              <Area type="monotone" dataKey="volume" stroke="var(--color-accent)" fill="url(#vol)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer></div> : <p className="flex min-h-48 items-center justify-center rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">No completed USDC transactions in the last 7 days.</p>}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-accent">View daily volume data</summary>
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
              <caption className="mb-2 text-left text-muted-foreground">Completed USDC volume and transaction counts, last 7 local dates.</caption>
              <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="py-2 pr-3">USDC</th><th scope="col" className="py-2">Completed tx</th></tr></thead>
              <tbody>{stats.days.map((day) => <tr key={day.date} className="border-b border-border"><th scope="row" className="py-2 pr-3 font-normal">{day.date}</th><td className="py-2 pr-3">{formatUsdc(day.volume)}</td><td className="py-2">{day.count}</td></tr>)}</tbody>
            </table></div>
          </details>
        </CardContent>
      </Card>
      <Card className="min-w-0 border-border bg-card lg:col-span-2">
        <CardHeader><CardTitle className="text-sm text-foreground">Chain usage</CardTitle><p className="text-xs text-muted-foreground">Transaction distribution by network.</p></CardHeader>
        <CardContent>
          {stats.empty ? <p className="flex min-h-48 items-center justify-center rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">No transactions recorded. Chain usage will appear when transactions are available.</p> : <>
            <div className="h-56" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer={false}>
              <Pie data={stats.chainUsage} dataKey="count" nameKey="name" innerRadius={55} outerRadius={85} stroke="var(--color-card)" isAnimationActive={false}>{stats.chainUsage.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie>
              <Tooltip contentStyle={chartTooltip} itemStyle={tooltipText} labelStyle={tooltipText} formatter={(value, name) => [`${value} transactions`, name]} />
            </PieChart></ResponsiveContainer></div>
            <ul aria-label="Chain usage counts and shares" className="mt-3 space-y-2 text-xs">
              {stats.chainUsage.map((c) => <li key={c.name} className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-foreground"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />{c.name}</span><span className="tabular-nums text-muted-foreground">{c.count} / {transactions.length} tx ({c.percentage < 0.1 ? "<0.1" : c.percentage.toFixed(1)}%)</span></li>)}
            </ul>
          </>}
        </CardContent>
      </Card>
      <Card className="min-w-0 border-border bg-card lg:col-span-5">
        <CardHeader><CardTitle className="text-sm text-foreground">Stablecoin allocation</CardTitle><p className="text-xs text-muted-foreground">Latest available balance values, in USD.</p></CardHeader>
        <CardContent>
          {allocation.some((b) => b.value > 0) ? <div className="h-56" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={allocation} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} /><XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} /><YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip contentStyle={chartTooltip} itemStyle={tooltipText} labelStyle={tooltipText} cursor={{ fill: "var(--color-muted)" }} formatter={(value) => [formatUsd(Number(value)), "Value (USD)"]} /><Bar dataKey="value" fill="var(--color-accent)" radius={[8, 8, 0, 0]} isAnimationActive={false} />
          </BarChart></ResponsiveContainer></div> : <p className="flex min-h-40 items-center justify-center rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">{allocation.length === 0 ? "No balance data available. Connect your wallet and refresh balances to see allocation." : "No positive stablecoin balances in the latest snapshot."}</p>}
          {allocation.length > 0 && <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-accent">View allocation data</summary>
            <table className="mt-3 w-full text-left text-xs tabular-nums">
              <caption className="mb-2 text-left text-muted-foreground">Stablecoin balances by token and network, valued in USD.</caption>
              <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3">Token / network</th><th scope="col" className="py-2">Value (USD)</th></tr></thead>
              <tbody>{allocation.map((b, i) => <tr key={`${b.name}-${i}`} className="border-b border-border"><th scope="row" className="py-2 pr-3 font-normal">{b.name}</th><td className="py-2">{formatUsd(b.value)}</td></tr>)}</tbody>
            </table>
          </details>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
