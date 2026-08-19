"use client";

import { useEffect, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePilotStore } from "@/store/pilot-store";
import { formatUsd } from "@/lib/utils";

const CHAIN_COLORS: Record<string, string> = { Arc: "#22d3ee", Arc_Testnet: "#22d3ee", Base: "#0052ff", Base_Sepolia: "#0052ff", Ethereum: "#627eea", Ethereum_Sepolia: "#627eea", Arbitrum: "#28a0f0", Other: "#64748b" };
function shortChain(id?: string | null): string { if (!id) return "Other"; if (id.includes("Arc")) return "Arc"; if (id.includes("Base")) return "Base"; if (id.includes("Ethereum") || id === "ETH") return "Ethereum"; if (id.includes("Arbitrum")) return "Arbitrum"; return id.replace(/_/g, " ").split(" ")[0] || "Other"; }

const chartTooltip = { background: "#ffffff", border: "1px solid #d9e2ec", borderRadius: 12, color: "#172033", boxShadow: "0 12px 28px rgba(15,23,42,.10)" };

export default function AnalyticsPage() {
  const { balances, transactions, hydrate, walletAddress, loadServerTransactions, refreshBalances } = usePilotStore();
  useEffect(() => { hydrate(); if (walletAddress) { void loadServerTransactions(walletAddress); refreshBalances(); } }, [hydrate, walletAddress, loadServerTransactions, refreshBalances]);

  const stats = useMemo(() => {
    const success = transactions.filter((t) => t.status === "success");
    const successRate = transactions.length === 0 ? 100 : Math.round((success.length / transactions.length) * 100);
    const volumeUsd = transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const fees = transactions.map((t) => t.feeUsd).filter((n): n is number => typeof n === "number");
    const avgFee = fees.length === 0 ? 0 : fees.reduce((a, b) => a + b, 0) / fees.length;
    const days: { day: string; volume: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); const key = d.toDateString(); const label = d.toLocaleDateString(undefined, { weekday: "short" }); const dayTx = transactions.filter((t) => { try { const td = new Date(t.createdAt); td.setHours(0, 0, 0, 0); return td.toDateString() === key; } catch { return false; } }); days.push({ day: label, volume: dayTx.reduce((s, t) => s + (Number(t.amount) || 0), 0), count: dayTx.length }); }
    const chainCounts = new Map<string, number>();
    for (const t of transactions) { const c = shortChain(t.toChain || t.fromChain || "Arc"); chainCounts.set(c, (chainCounts.get(c) || 0) + 1); }
    if (chainCounts.size === 0) chainCounts.set("Arc", 1);
    const totalC = [...chainCounts.values()].reduce((a, b) => a + b, 0) || 1;
    const chainUsage = [...chainCounts.entries()].map(([name, n]) => ({ name, value: Math.round((n / totalC) * 100) || 1, color: CHAIN_COLORS[name] || CHAIN_COLORS.Other }));
    return { successRate, volumeUsd, avgFee, days, chainUsage, empty: transactions.length === 0 };
  }, [transactions]);

  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
    <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight text-[#0b1220]">Analytics</h1><p className="mt-1 text-sm text-[#5b6b80]">Built from your session transactions{stats.empty ? " — run a swap/send/bridge to populate charts" : ` · ${transactions.length} tx recorded`}</p></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[{ label: "Unified balance", value: formatUsd(balances.totalUsd) }, { label: "Tx success rate", value: `${stats.successRate}%` }, { label: "Session volume", value: formatUsd(stats.volumeUsd) }, { label: "Avg network fee", value: stats.avgFee > 0 ? formatUsd(stats.avgFee) : "—" }].map((s) => <Card key={s.label}><CardContent className="p-5"><div className="text-xs uppercase tracking-wider text-[#5b6b80]">{s.label}</div><div className="mt-2 text-2xl font-semibold tabular-nums text-[#0b1220]">{s.value}</div></CardContent></Card>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3"><CardHeader><CardTitle className="text-sm">Volume (last 7 days)</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.days}><defs><linearGradient id="vol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="day" stroke="#64748b" fontSize={12} /><YAxis stroke="#64748b" fontSize={12} /><Tooltip contentStyle={chartTooltip} /><Area type="monotone" dataKey="volume" stroke="#2563eb" fill="url(#vol)" strokeWidth={2} /></AreaChart></ResponsiveContainer></CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-sm">Chain usage</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.chainUsage} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{stats.chainUsage.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip contentStyle={chartTooltip} /></PieChart></ResponsiveContainer><div className="-mt-2 flex flex-wrap justify-center gap-3">{stats.chainUsage.map((c) => <span key={c.name} className="flex items-center gap-1.5 text-[11px] text-[#526173]"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name} {c.value}%</span>)}</div></CardContent></Card>
      <Card className="lg:col-span-5"><CardHeader><CardTitle className="text-sm">Stablecoin allocation</CardTitle></CardHeader><CardContent className="h-56">{balances.balances.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-[#5b6b80]">Connect wallet and refresh balances to see allocation</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={balances.balances.map((b) => ({ name: `${b.token}@${(b.chainLabel || String(b.chain) || "Arc").split(" ")[0]}`, value: b.usdValue }))}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={12} /><Tooltip contentStyle={chartTooltip} /><Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>}</CardContent></Card>
    </div>
  </div>;
}
