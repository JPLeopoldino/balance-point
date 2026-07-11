import type { Money } from "@balance-point/money";

import { type ISODate, type Month, addMonths, dateInMonth, monthOfDate } from "./month";

export interface PlanScheduleInput {
  totalAmount: Money;
  mode: "lump_sum" | "installments";
  installments: number | null;
  startDate: ISODate;
}

export interface PlanOutflow {
  month: Month;
  dueDate: ISODate;
  amount: Money;
  installmentNumber: number | null;
  installmentTotal: number | null;
}

/**
 * Outflow schedule of a purchase plan (doc 04 §4.12). Installments split the
 * total evenly; the LAST installment absorbs the rounding remainder so the
 * emitted amounts always sum exactly to totalAmount.
 */
export function planOutflows(plan: PlanScheduleInput): PlanOutflow[] {
  const startMonth = monthOfDate(plan.startDate);
  const day = Number(plan.startDate.slice(8, 10));

  if (plan.mode === "lump_sum") {
    return [
      {
        month: startMonth,
        dueDate: dateInMonth(startMonth, day),
        amount: plan.totalAmount,
        installmentNumber: null,
        installmentTotal: null,
      },
    ];
  }

  const count = Math.max(1, plan.installments ?? 1);
  const base = Math.floor(plan.totalAmount / count);
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(startMonth, i);
    const isLast = i === count - 1;
    return {
      month,
      dueDate: dateInMonth(month, day),
      amount: isLast ? plan.totalAmount - base * (count - 1) : base,
      installmentNumber: i + 1,
      installmentTotal: count,
    };
  });
}
