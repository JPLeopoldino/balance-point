"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { currentMonth } from "@/lib/format";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Month switcher state, persisted in the URL as ?month=YYYY-MM (doc 09 §9.1). */
export function useMonth() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const raw = searchParams.get("month");
  const month = raw && MONTH_RE.test(raw) ? raw : currentMonth();

  const setMonth = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === currentMonth()) params.delete("month");
      else params.set("month", next);
      const query = params.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { month, setMonth, isCurrentMonth: month === currentMonth() };
}
