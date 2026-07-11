import type { Currency, Money } from "@balance-point/money";
import { roundHalfAwayFromZero, sumMoney } from "@balance-point/money";

export interface RecurringChargeLike {
  frequency: "monthly" | "every_n_months" | "manual";
  intervalMonths: number;
  defaultAmount: Money;
  currency: Currency;
}

/**
 * Monthly-equivalent cost of a recurring charge (doc 04 §4.3): amortizes
 * non-monthly cadences; manual templates cost nothing until charged.
 */
export function monthlyEquivalent(r: {
  frequency: "monthly" | "every_n_months" | "manual";
  intervalMonths: number;
  defaultAmount: Money;
}): Money {
  switch (r.frequency) {
    case "monthly":
      return r.defaultAmount;
    case "every_n_months":
      return roundHalfAwayFromZero(r.defaultAmount / Math.max(1, r.intervalMonths));
    case "manual":
      return 0;
  }
}

export interface CardUsage {
  committedMonthly: Money;
  openCharges: Money;
  used: Money;
  available: Money;
}

/**
 * Derived credit for one card, everything in the card's own currency
 * (doc 04 §4.3). `conv` converts a charge into the card's currency.
 */
export function cardUsage(
  creditLimit: Money,
  activeRecurring: RecurringChargeLike[],
  openBills: { amount: Money; currency: Currency }[],
  conv: (units: Money, from: Currency) => Money,
): CardUsage {
  const committedMonthly = sumMoney(
    ...activeRecurring.map((r) => conv(monthlyEquivalent(r), r.currency)),
  );
  const openCharges = sumMoney(...openBills.map((b) => conv(b.amount, b.currency)));
  const used = committedMonthly + openCharges;
  return { committedMonthly, openCharges, used, available: creditLimit - used };
}
