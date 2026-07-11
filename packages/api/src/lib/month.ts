/**
 * Month/date helpers. Months are 'YYYY-MM' keys, calendar dates are plain
 * 'YYYY-MM-DD' strings (never Date-shifted through timezones — doc 04 §4.14).
 */

export type Month = string; // 'YYYY-MM'
export type ISODate = string; // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, "0");

export function monthOfDate(isoDate: ISODate): Month {
  return isoDate.slice(0, 7);
}

/** "Today" on the server's wall clock (the app is self-hosted by its user). */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now: Date = new Date()): Month {
  return todayISO(now).slice(0, 7);
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  return `${year}-${pad((total % 12) + 1)}`;
}

/** Whole months from `a` to `b` ('YYYY-MM' keys): monthDiff('2026-01','2026-03') = 2. */
export function monthDiff(a: Month, b: Month): number {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

export function daysInMonth(month: Month): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
}

/** Build the date for `day` inside `month`, clamping overflow (31 → Feb 28). */
export function dateInMonth(month: Month, day: number): ISODate {
  const clamped = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${pad(clamped)}`;
}

export function monthRange(start: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** Add calendar months to a timestamp, clamping the day (Jan 31 + 1mo → Feb 28). */
export function addMonthsToTimestamp(date: Date, n: number): Date {
  const target = new Date(date.getTime());
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + n);
  const max = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, max));
  return target;
}

/** Number of whole calendar months elapsed between two timestamps (≥ 0). */
export function wholeMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  while (months > 0 && addMonthsToTimestamp(from, months).getTime() > to.getTime()) {
    months -= 1;
  }
  return Math.max(0, months);
}
