"use client";

import type { Currency } from "@balance-point/money";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@balance-point/ui/components/chart";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";

/** Baseline vs. with-plan series (doc 08 §8.7) — the dip is the story. */
export function PlanSimulationChart({
  rows,
  currency,
}: {
  rows: { month: string; baselineBalance: number; balanceWithPlan: number }[];
  currency: Currency;
}) {
  const t = useT();
  const { formatMonthShort } = useFormat();
  const config = {
    baseline: { label: t("charts.baseline"), color: "var(--chart-2)" },
    withPlan: { label: t("charts.withPlan"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const data = rows.map((r) => ({
    label: formatMonthShort(r.month),
    baseline: r.baselineBalance,
    withPlan: r.balanceWithPlan,
  }));
  const hasNegative = rows.some((r) => r.balanceWithPlan < 0);

  return (
    <ChartContainer config={config} className="h-60 w-full md:h-72">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 10 }} />
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
              formatter={(value, name, item) => (
                <>
                  <div
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span
                    className={`ml-auto font-medium tabular-nums ${Number(value) < 0 ? "text-destructive" : ""}`}
                  >
                    {formatMoney(Number(value), currency)}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="baseline"
          type="monotone"
          stroke="var(--color-baseline)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
        <Line
          dataKey="withPlan"
          type="monotone"
          stroke="var(--color-withPlan)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
