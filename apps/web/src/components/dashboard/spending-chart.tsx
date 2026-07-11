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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";

/** 12-month total vs. paid bar (doc 08 §8.7): stacked paid + remaining = total. */
export function SpendingChart({
  data,
  currency,
}: {
  data: { month: string; totalBills: number; paidBills: number; remainingBills: number }[];
  currency: Currency;
}) {
  const t = useT();
  const { formatMonthShort } = useFormat();
  const config = {
    paid: { label: t("charts.paid"), color: "var(--chart-1)" },
    remaining: { label: t("charts.remaining"), color: "var(--chart-2)" },
  } satisfies ChartConfig;

  const rows = data.map((d) => ({
    label: formatMonthShort(d.month),
    paid: d.paidBills,
    remaining: d.remainingBills,
  }));

  return (
    <ChartContainer config={config} className="h-56 w-full md:h-64">
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fontSize: 10 }}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item, index) => (
                <>
                  <div
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {formatMoney(Number(value), currency)}
                  </span>
                  {index === 1 ? (
                    <div className="mt-1 flex basis-full items-center justify-between gap-4 border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">{t("charts.total")}</span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(
                          (item.payload as { paid: number; remaining: number }).paid +
                            (item.payload as { paid: number; remaining: number }).remaining,
                          currency,
                        )}
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="paid" stackId="bills" fill="var(--color-paid)" radius={[0, 0, 4, 4]} />
        <Bar
          dataKey="remaining"
          stackId="bills"
          fill="var(--color-remaining)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
