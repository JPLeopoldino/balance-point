"use client";

import { Button } from "@balance-point/ui/components/button";
import { Calendar } from "@balance-point/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@balance-point/ui/components/popover";
import { ptBR as dateFnsPtBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { useFormat, useLocale, useT } from "@/i18n";
import { addMonths, currentMonth } from "@/lib/format";

/** Inclusive due-date window shown on the Bills screen. */
export interface BillsRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export function monthToRange(month: string): BillsRange {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The whole calendar month a range covers, or null when it's a custom range. */
export function rangeMonth(range: BillsRange): string | null {
  const month = range.from.slice(0, 7);
  const whole = monthToRange(month);
  return range.from === whole.from && range.to === whole.to ? month : null;
}

// Calendar days are local dates; keep conversions timezone-shift free (§4.14).
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

function dateToISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Due-date filter (doc 09 §9.3): defaults to the current month, the arrows
 * step whole months, and the calendar picks a specific day or a custom range.
 */
export function DateRangeFilter({
  value,
  onChange,
  compact = false,
}: {
  value: BillsRange;
  onChange: (range: BillsRange) => void;
  /** Phone chrome: "junho/26" instead of "junho de 2026", and no min width. */
  compact?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { formatMonth, formatMonthCompact, formatDate, formatDateCompact } = useFormat();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>();

  const month = rangeMonth(value);
  const isCurrentMonth = month === currentMonth();
  const fmtMonth = compact ? formatMonthCompact : formatMonth;
  const fmtDate = compact ? formatDateCompact : formatDate;
  const label = month
    ? fmtMonth(month)
    : value.from === value.to
      ? fmtDate(value.from, { withYear: true })
      : `${fmtDate(value.from)} – ${fmtDate(value.to, { withYear: true })}`;

  // Arrows step whole months; a custom range jumps to its starting month first.
  function step(delta: number) {
    const next = monthToRange(addMonths(month ?? value.from.slice(0, 7), delta));
    onChange(next);
    // Compact mode steps from inside the open popover, so the calendar's
    // pending selection has to follow — otherwise Apply would commit the month
    // the user stepped away from.
    setPending({ from: isoToDate(next.from), to: isoToDate(next.to) });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setPending({ from: isoToDate(value.from), to: isoToDate(value.to) });
  }

  function apply() {
    if (!pending?.from) return;
    const from = pending.from;
    const to = pending.to ?? pending.from;
    onChange(
      from.getTime() <= to.getTime()
        ? { from: dateToISO(from), to: dateToISO(to) }
        : { from: dateToISO(to), to: dateToISO(from) },
    );
    setOpen(false);
  }

  const presets = [
    { month: addMonths(currentMonth(), -1), label: t("dateFilter.lastMonth") },
    { month: currentMonth(), label: t("dateFilter.thisMonth") },
    { month: addMonths(currentMonth(), 1), label: t("dateFilter.nextMonth") },
  ];

  const prevMonth = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("monthSwitcher.previous")}
      onClick={() => step(-1)}
    >
      <ChevronLeftIcon />
    </Button>
  );
  const nextMonth = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("monthSwitcher.next")}
      onClick={() => step(1)}
    >
      <ChevronRightIcon />
    </Button>
  );

  return (
    // shrink-0: the month label must stay legible — the bank select next to it
    // is the one that gives way when the row is tight.
    <div className="flex shrink-0 items-center gap-0.5">
      {/*
       * Compact mode drops the inline ‹ › arrows. Beside the tab pills on a
       * 360px phone, 192px of tabs + two 40px targets + the label do not fit,
       * and shrinking the arrows to force it would push them under the
       * touch-target floor. They move into the popover instead — one tap
       * further, but full size and never clipped.
       */}
      {compact ? null : prevMonth}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              // The label carries the value, so name the button with both —
              // a bare "Period" tells a screen reader nothing about the month.
              aria-label={`${t("dateFilter.label")}: ${label}`}
              className={`justify-center font-medium ${compact ? "min-w-0 px-2.5" : "min-w-36"} ${isCurrentMonth ? "" : "text-primary"}`}
            />
          }
        >
          <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
          {label}
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto gap-1.5 p-2">
          {/* The month stepper the compact trigger gave up. */}
          {compact ? (
            <div className="flex items-center justify-between gap-1 border-b border-border pb-1.5">
              {prevMonth}
              <span className="text-sm font-medium">{label}</span>
              {nextMonth}
            </div>
          ) : null}
          <div className="flex items-center gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.month}
                variant={month === preset.month ? "secondary" : "ghost"}
                size="xs"
                className={`flex-1 ${month === preset.month ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => {
                  onChange(monthToRange(preset.month));
                  setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={1}
            defaultMonth={isoToDate(value.from)}
            selected={pending}
            onSelect={(range, selectedDay) => {
              // Clicking with a complete range selected starts a new one
              // instead of stretching the old selection to the clicked day.
              setPending((prev) =>
                prev?.from && prev?.to ? { from: selectedDay, to: undefined } : range,
              );
            }}
            locale={locale === "pt-BR" ? dateFnsPtBR : undefined}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5">
            <span className="text-[11px] text-muted-foreground">{t("dateFilter.hint")}</span>
            <Button size="xs" onClick={apply} disabled={!pending?.from}>
              {t("dateFilter.apply")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {compact ? null : nextMonth}
    </div>
  );
}
