import type { Currency, Money } from "@balance-point/money";
import { sumMoney } from "@balance-point/money";

export interface BillAmountLike {
  amount: Money;
  currency: Currency;
  paid: boolean;
}

export interface MonthRollup {
  totalBills: Money;
  paidBills: Money;
  remainingBills: Money;
}

/**
 * Monthly roll-up in the display currency (doc 04 §4.4). The critical nuance:
 * "Month bills" is the REMAINING (unpaid) figure, not the total.
 */
export function monthRollup(
  bills: BillAmountLike[],
  conv: (units: Money, from: Currency) => Money,
): MonthRollup {
  const totalBills = sumMoney(...bills.map((b) => conv(b.amount, b.currency)));
  const paidBills = sumMoney(...bills.filter((b) => b.paid).map((b) => conv(b.amount, b.currency)));
  return { totalBills, paidBills, remainingBills: totalBills - paidBills };
}
