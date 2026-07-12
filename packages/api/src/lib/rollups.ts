import type { Currency, Money } from "@balance-point/money";
import { sumMoney } from "@balance-point/money";

export interface BillAmountLike {
  amount: Money;
  currency: Currency;
  paid: boolean;
  wontPay: boolean;
}

export interface MonthRollup {
  totalBills: Money;
  paidBills: Money;
  remainingBills: Money;
  wontPayBills: Money;
}

/**
 * Monthly roll-up in the display currency (doc 04 §4.4). The critical nuance:
 * "Month bills" is the REMAINING (unpaid) figure, not the total. Bills flagged
 * "won't pay" leave the payable math entirely (total = paid + remaining still
 * holds) and are reported separately as `wontPayBills`.
 */
export function monthRollup(
  bills: BillAmountLike[],
  conv: (units: Money, from: Currency) => Money,
): MonthRollup {
  const payable = bills.filter((b) => !b.wontPay);
  const totalBills = sumMoney(...payable.map((b) => conv(b.amount, b.currency)));
  const paidBills = sumMoney(
    ...payable.filter((b) => b.paid).map((b) => conv(b.amount, b.currency)),
  );
  const wontPayBills = sumMoney(
    ...bills.filter((b) => b.wontPay).map((b) => conv(b.amount, b.currency)),
  );
  return { totalBills, paidBills, remainingBills: totalBills - paidBills, wontPayBills };
}
