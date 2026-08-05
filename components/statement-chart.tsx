"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint } from "@/lib/statement";
import type { TokenSymbol } from "@/lib/tokens";

/**
 * Categorical pair, assigned by entity and never by rank: USDC is always the green,
 * EURC always the blue, so changing the range cannot repaint a series.
 *
 * Both steps were run through the dataviz validator and pass every check on the dark
 * AND light surface: lightness band, chroma floor, CVD separation (ΔE 23.1 deutan),
 * normal-vision separation (ΔE 24.4) and 3:1 contrast.
 *
 * Kred's brand emerald (#31DB90) is deliberately NOT used here. It measures L 0.79,
 * outside the 0.48–0.67 band, and paired with the brand cyan it scores ΔE 15.0 for
 * normal vision, which is the floor — two Kred-looking colors nobody can tell apart
 * is a worse chart than two that are merely on-brand-adjacent. #0E9F6E is the same
 * green as the architecture diagram, so this still sits inside the system.
 */
const SERIES: Record<TokenSymbol, string> = {
  USDC: "#0E9F6E",
  EURC: "#3B82F6",
};

const monthShort = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });

const monthLong = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

const amount = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function StatementChart({
  data,
  tokens,
}: {
  data: MonthPoint[];
  tokens: TokenSymbol[];
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  // Grid and axes stay recessive: they are scaffolding for the bars, not content.
  const grid = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const axisInk = dark ? "rgba(230,230,230,0.55)" : "rgba(11,11,11,0.55)";
  const surface = dark ? "#11171d" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const ink = dark ? "#e6e6e6" : "#0b0b0b";

  if (!mounted) return <div className="h-[260px]" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
        // 2px of surface between adjacent bars, so the pair reads as two marks
        // rather than one two-toned block.
        barGap={2}
        barCategoryGap="28%"
      >
        <CartesianGrid vertical={false} stroke={grid} strokeDasharray="0" />
        <XAxis
          dataKey="month"
          tickFormatter={monthShort}
          tick={{ fill: axisInk, fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: grid }}
          dy={4}
        />
        <YAxis
          tick={{ fill: axisInk, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toLocaleString("en-US")}k` : String(v)
          }
        />
        <Tooltip
          cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
          contentStyle={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 12,
            color: ink,
            fontSize: 13,
            boxShadow: dark
              ? "0 8px 24px rgba(0,0,0,0.45)"
              : "0 8px 24px rgba(0,0,0,0.10)",
            padding: "8px 12px",
          }}
          itemStyle={{ padding: "2px 0" }}
          labelStyle={{
            color: axisInk,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 4,
          }}
          labelFormatter={(m: string) => monthLong(m)}
          // Name the currency on the value. "40" alone is ambiguous on a chart
          // that deliberately never adds the two together.
          formatter={(v: number, name) => [`${amount(v)} ${name}`, ""]}
          separator=""
        />
        <Legend
          iconType="circle"
          iconSize={9}
          wrapperStyle={{ fontSize: 12, color: axisInk, paddingTop: 10 }}
        />
        {tokens.map((sym) => (
          <Bar
            key={sym}
            dataKey={sym}
            name={sym}
            fill={SERIES[sym]}
            // Rounded data-end, square against the baseline: the bar grows from
            // the axis, so only the top should be soft.
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
