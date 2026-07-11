"use client";

import type { Currency } from "@balance-point/money";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@balance-point/ui/components/chart";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";

/** Projected balance area (doc 08 §8.7); below-zero months read as destructive. */
export function ProjectionChart({
  rows,
  currency,
  className,
}: {
  rows: { month: string; projectedBalance: number }[];
  currency: Currency;
  className?: string;
}) {
  const t = useT();
  const { formatMonthShort } = useFormat();
  const config = {
    balance: { label: t("charts.projectedBalance"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const data = rows.map((r) => ({ label: formatMonthShort(r.month), balance: r.projectedBalance }));
  const hasNegative = rows.some((r) => r.projectedBalance < 0);

  return (
    <ChartContainer config={config} className={className ?? "h-56 w-full md:h-64"}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="projectionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-balance)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-balance)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        {hasNegative ? (
          <ReferenceLine y={0} stroke="var(--destructive)" strokeOpacity={0.5} strokeDasharray="4 4" />
        ) : null}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span
                  className={`ml-auto font-medium tabular-nums ${Number(value) < 0 ? "text-destructive" : ""}`}
                >
                  {formatMoney(Number(value), currency)}
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="balance"
          type="monotone"
          stroke="var(--color-balance)"
          strokeWidth={2}
          fill="url(#projectionFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
