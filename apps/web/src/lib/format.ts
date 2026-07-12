import type { Currency, Money } from "@balance-point/money";
import { formatMoney } from "@balance-point/money";

export { formatMoney, fromMinorUnits, toMinorUnits } from "@balance-point/money";
export type { Currency, Money } from "@balance-point/money";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DATE_LONG = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** 'YYYY-MM' → "July 2026". */
export function formatMonth(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

/** 'YYYY-MM' → "Jul 26" (chart axes). */
export function formatMonthShort(month: string): string {
  return MONTH_SHORT.format(new Date(`${month}-01T00:00:00Z`));
}

/** 'YYYY-MM-DD' → "Jul 5" (or with year when not the current one). */
export function formatDate(isoDate: string, { withYear = false } = {}): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return withYear ? DATE_LONG.format(date) : DATE_FORMAT.format(date);
}

export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export type BillStatus = "paid" | "wont-pay" | "overdue" | "due-soon" | "pending";

/** Overdue/due-soon rules from doc 04 §4.13. */
export function billStatus(bill: { paid: boolean; wontPay: boolean; dueDate: string }): BillStatus {
  if (bill.paid) return "paid";
  if (bill.wontPay) return "wont-pay";
  const today = todayISO();
  if (bill.dueDate < today) return "overdue";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  if (bill.dueDate <= soon.toISOString().slice(0, 10)) return "due-soon";
  return "pending";
}

/** Money with an explicit sign, colored by the caller. */
export function formatSigned(units: Money, currency: Currency): string {
  return formatMoney(units, currency, { sign: true });
}
