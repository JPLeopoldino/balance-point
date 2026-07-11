import type { Money } from "@balance-point/money";

import type { Month } from "./month";

export interface ProjectionRow {
  month: Month;
  income: Money;
  bills: Money;
  additionalSpend: Money;
  yield: Money;
  projectedBalance: Money;
}

export interface ProjectionInputs {
  /** Free Total (doc 04 §4.8): TotalMoney − remainingBills(currentMonth), in display currency. */
  seedFreeTotal: Money;
  /** Ordered future months, next month first. */
  months: Month[];
  incomeFor: (month: Month) => Money;
  billsFor: (month: Month) => Money;
  additionalFor: (month: Month) => Money;
  yieldFor?: (month: Month) => Money;
}

/**
 * The spreadsheet's projection, exactly (doc 02 §2.2-E):
 * balance[k] = balance[k−1] + income − (bills + additional) [+ yield].
 * Golden: seed 2785.75, income 20000, bills 9952.21 → row 1 = 12833.54.
 */
export function buildProjection(inputs: ProjectionInputs): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let balance = inputs.seedFreeTotal;
  for (const month of inputs.months) {
    const income = inputs.incomeFor(month);
    const bills = inputs.billsFor(month);
    const additionalSpend = inputs.additionalFor(month);
    const yieldAmount = inputs.yieldFor?.(month) ?? 0;
    balance = balance + income - (bills + additionalSpend) + yieldAmount;
    rows.push({ month, income, bills, additionalSpend, yield: yieldAmount, projectedBalance: balance });
  }
  return rows;
}
