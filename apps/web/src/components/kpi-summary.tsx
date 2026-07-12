"use client";

import type { Currency, Money } from "@balance-point/money";
import { Card, CardContent } from "@balance-point/ui/components/card";
import { Skeleton } from "@balance-point/ui/components/skeleton";

import { AnimatedNumber } from "@/components/animated-number";
import { KpiCard } from "@/components/kpi-card";
import { Stagger, StaggerItem } from "@/components/stagger";
import { formatMoney } from "@/lib/format";

export interface Kpi {
  label: string;
  /** Compact label for the phone strip — falls back to `label`. */
  shortLabel?: string;
  value: Money;
  currency: Currency;
  sublabel?: React.ReactNode;
  /** The one figure that matters. Becomes the hero on a phone. */
  emphasis?: boolean;
  destructive?: boolean;
  negativeIsBad?: boolean;
}

function toneOf(kpi: Kpi): string {
  const negative = kpi.value < 0;
  if (kpi.destructive || (negative && (kpi.negativeIsBad ?? true))) return "text-destructive";
  return kpi.emphasis ? "text-primary" : "";
}

/**
 * Period roll-up above a list (Bills, Cards).
 *
 * Desktop keeps the four-card row. On a phone those four become a 2×2 grid
 * ~225px tall — two bills' worth of screen spent on context before the user
 * sees a single row of the thing they opened the screen for. And they're all
 * weighted the same, so nothing leads.
 *
 * Below md it collapses to the one figure that matters, with the other three as
 * a compact strip underneath: ~130px, and an actual hierarchy.
 *
 * Both branches render — swapping on a CSS breakpoint rather than a JS media
 * query keeps the right one on screen from the very first paint.
 */
export function KpiSummary({ stats, loading = false }: { stats: Kpi[]; loading?: boolean }) {
  const hero = stats.find((stat) => stat.emphasis) ?? stats[0];
  if (!hero) return null;
  const rest = stats.filter((stat) => stat !== hero);

  return (
    <>
      <Card size="sm" className="md:hidden">
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {hero.label}
            </span>
            {hero.sublabel ? (
              loading ? (
                <Skeleton className="h-3 w-14" />
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{hero.sublabel}</span>
              )
            ) : null}
          </div>

          {loading ? (
            <Skeleton className="my-1 h-8 w-40" />
          ) : (
            <span className={`text-3xl font-semibold tabular-nums ${toneOf(hero)}`}>
              <AnimatedNumber value={hero.value} format={(v) => formatMoney(v, hero.currency)} />
            </span>
          )}

          {rest.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2">
              {rest.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[10px] tracking-wide text-muted-foreground uppercase">
                    {stat.shortLabel ?? stat.label}
                  </span>
                  {loading ? (
                    <Skeleton className="h-3.5 w-14" />
                  ) : (
                    <span className={`truncate text-xs font-medium tabular-nums ${toneOf(stat)}`}>
                      {formatMoney(stat.value, stat.currency)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Stagger className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-4">
        {stats.map((stat) => (
          <StaggerItem key={stat.label}>
            <KpiCard
              label={stat.label}
              value={stat.value}
              currency={stat.currency}
              sublabel={stat.sublabel}
              emphasis={stat.emphasis}
              destructive={stat.destructive}
              negativeIsBad={stat.negativeIsBad}
              loading={loading}
            />
          </StaggerItem>
        ))}
      </Stagger>
    </>
  );
}
