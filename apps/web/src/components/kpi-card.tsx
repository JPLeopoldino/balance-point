"use client";

import type { Currency, Money } from "@balance-point/money";
import { Card, CardContent } from "@balance-point/ui/components/card";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { motion, useReducedMotion } from "motion/react";

import { AnimatedNumber } from "@/components/animated-number";
import { formatMoney } from "@/lib/format";

/** Dashboard KPI with count-up + staggered entrance (doc 08 §8.6). */
export function KpiCard({
  label,
  value,
  currency,
  index = 0,
  emphasis = false,
  negativeIsBad = true,
  destructive = false,
  sublabel,
  loading = false,
}: {
  label: string;
  value: Money;
  currency: Currency;
  index?: number;
  /** Yellow figure — reserve for the single most important number. */
  emphasis?: boolean;
  negativeIsBad?: boolean;
  /** Force the red tone regardless of sign (e.g. overdue totals). */
  destructive?: boolean;
  sublabel?: React.ReactNode;
  loading?: boolean;
}) {
  const reduced = useReducedMotion();
  const negative = value < 0;
  const tone =
    destructive || (negative && negativeIsBad)
      ? "text-destructive"
      : emphasis
        ? "text-primary"
        : "";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduced ? 0 : index * 0.04, ease: "easeOut" }}
    >
      <Card size="sm" className="h-full">
        <CardContent className="flex h-full flex-col gap-1">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <span className={`text-2xl font-semibold tabular-nums md:text-3xl ${tone}`}>
              <AnimatedNumber value={value} format={(v) => formatMoney(v, currency)} />
            </span>
          )}
          {sublabel ? <span className="text-xs text-muted-foreground">{sublabel}</span> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
