"use client";

import type { Currency, Money } from "@balance-point/money";
import { Card, CardContent } from "@balance-point/ui/components/card";
import { Skeleton } from "@balance-point/ui/components/skeleton";

import { AnimatedNumber } from "@/components/animated-number";
import { formatMoney } from "@/lib/format";

/**
 * Dashboard KPI with a count-up figure (doc 08 §8.6).
 *
 * The entrance animation deliberately does NOT live here — it comes from the
 * <Stagger/> this is rendered inside, so a screen's cards rise as one wave
 * instead of each timing itself off an `index` that restarts per section.
 *
 * While loading, the label still renders: it's static copy, and showing it is
 * strictly more useful than a grey bar in its place.
 */
export function KpiCard({
  label,
  value,
  currency,
  emphasis = false,
  negativeIsBad = true,
  destructive = false,
  sublabel,
  loading = false,
}: {
  label: string;
  value: Money;
  currency: Currency;
  /** Yellow figure — reserve for the single most important number. */
  emphasis?: boolean;
  negativeIsBad?: boolean;
  /** Force the red tone regardless of sign (e.g. overdue totals). */
  destructive?: boolean;
  sublabel?: React.ReactNode;
  loading?: boolean;
}) {
  const negative = value < 0;
  const tone =
    destructive || (negative && negativeIsBad)
      ? "text-destructive"
      : emphasis
        ? "text-primary"
        : "";

  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex h-full flex-col gap-1">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {loading ? (
          <Skeleton className="my-0.5 h-7 w-28 md:h-8" />
        ) : (
          // Two of these sit side by side on a 390px phone, leaving ~150px of
          // content width — `text-2xl` wrapped "R$ 68.072,60" onto two lines.
          <span className={`text-xl font-semibold tabular-nums sm:text-2xl md:text-3xl ${tone}`}>
            <AnimatedNumber value={value} format={(v) => formatMoney(v, currency)} />
          </span>
        )}
        {sublabel ? (
          loading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <span className="text-xs text-muted-foreground">{sublabel}</span>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
