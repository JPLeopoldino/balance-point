import { Skeleton } from "@balance-point/ui/components/skeleton";

/**
 * Loading placeholders that mirror each dashboard card's real layout
 * (doc 08 §8.9) — the point is that nothing moves when the data lands, so the
 * bars sit exactly where the text they stand in for will.
 *
 * Widths are varied on purpose: a column of identical bars reads as a grid of
 * boxes, not as a list of names.
 */

const NAME_WIDTHS = ["w-28", "w-36", "w-24", "w-32", "w-20"];

/** Account rows: colour dot · name · currency chip · checking · invested. */
export function AccountRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-2.5">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <Skeleton className={`h-3.5 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
          <Skeleton className="ml-auto h-4 w-9 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Upcoming bills: name over due-date, amount, pay button. */
export function UpcomingBillsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={`h-3.5 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-9 w-14 rounded-md md:h-6" />
        </div>
      ))}
    </div>
  );
}

/** Card strip: dot · name · free amount, over a usage bar. */
export function CardsStripSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className={`h-3.5 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
            <Skeleton className="ml-auto h-3.5 w-20" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Chart: baseline + bars of varying height, so it reads as a chart. */
export function ChartSkeleton({ bars = 12 }: { bars?: number }) {
  // Deterministic pseudo-random heights — a flat row of equal bars looks broken,
  // and Math.random() here would desync server and client HTML.
  const heights = Array.from(
    { length: bars },
    (_, i) => 28 + ((i * 37) % 63),
  );
  return (
    <div className="flex h-56 w-full flex-col justify-end gap-2">
      <div className="flex flex-1 items-end gap-1.5">
        {heights.map((height, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-sm rounded-b-none"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-px w-full rounded-none" />
      <div className="flex justify-between">
        <Skeleton className="h-2.5 w-8" />
        <Skeleton className="h-2.5 w-8" />
        <Skeleton className="h-2.5 w-8" />
        <Skeleton className="h-2.5 w-8" />
      </div>
    </div>
  );
}
