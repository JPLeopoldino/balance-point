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
}: {
  value: BillsRange;
  onChange: (range: BillsRange) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { formatMonth, formatDate } = useFormat();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>();

  const month = rangeMonth(value);
  const isCurrentMonth = month === currentMonth();
  const label = month
    ? formatMonth(month)
    : value.from === value.to
      ? formatDate(value.from, { withYear: true })
      : `${formatDate(value.from)} – ${formatDate(value.to, { withYear: true })}`;

  // Arrows step whole months; a custom range jumps to its starting month first.
  function step(delta: number) {
    onChange(monthToRange(addMonths(month ?? value.from.slice(0, 7), delta)));
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

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("monthSwitcher.previous")}
        onClick={() => step(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={t("dateFilter.label")}
              className={`min-w-36 justify-center font-medium ${isCurrentMonth ? "" : "text-primary"}`}
            />
          }
        >
          <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
          {label}
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto gap-1.5 p-2">
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
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("monthSwitcher.next")}
        onClick={() => step(1)}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
