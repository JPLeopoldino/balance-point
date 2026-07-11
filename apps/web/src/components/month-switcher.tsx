"use client";

import { Button } from "@balance-point/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { useMonth } from "@/hooks/use-month";
import { useFormat, useT } from "@/i18n";
import { addMonths, currentMonth } from "@/lib/format";

export function MonthSwitcher() {
  const { month, setMonth, isCurrentMonth } = useMonth();
  const t = useT();
  const { formatMonth } = useFormat();

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("monthSwitcher.previous")}
        onClick={() => setMonth(addMonths(month, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`min-w-28 justify-center font-medium ${isCurrentMonth ? "" : "text-primary"}`}
        onClick={() => setMonth(currentMonth())}
        title={t("monthSwitcher.backToCurrent")}
      >
        {formatMonth(month)}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("monthSwitcher.next")}
        onClick={() => setMonth(addMonths(month, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
