"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/utils";

const chartTooltip = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
  boxShadow: "0 12px 28px rgba(0,0,0,.3)",
};
const tooltipText = { color: "var(--color-foreground)" };

export const formatUsdc = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : "0.00";

export interface DailyVolumePoint {
  day: string;
  date: string;
  fullDate: string;
  volume: number;
  count: number;
}

export interface ChainUsagePoint {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AllocationPoint {
  name: string;
  value: number;
}

export function VolumeAreaChart({ days }: { days: DailyVolumePoint[] }) {
  return (
    <div className="h-64 min-h-[256px] w-full pt-2">
      <ResponsiveContainer width="100%" height={256}>
        <AreaChart data={days} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
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
  );
}

export function ChainUsagePieChart({ chainUsage }: { chainUsage: ChainUsagePoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height={224}>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={chainUsage}
            dataKey="count"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            stroke="var(--color-card)"
            isAnimationActive={false}
          >
            {chainUsage.map((e) => (
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
  );
}

export function AllocationBarChart({ allocation }: { allocation: AllocationPoint[] }) {
  return (
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
  );
}
