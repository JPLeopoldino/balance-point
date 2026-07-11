import type { Money, RatePeriod } from "@balance-point/money";
import { monthlyYieldAccrual } from "@balance-point/money";

import { addMonthsToTimestamp, wholeMonthsBetween } from "./month";

export interface YieldCatchUp {
  /** Whole months applied. */
  months: number;
  /** Total accrued over those months (compounding). */
  accrued: Money;
  newBalance: Money;
  /** Advanced by exactly `months` so the partial-month remainder keeps counting. */
  nextLastAccruedAt: Date;
}

/**
 * Catch-up accrual for one account (doc 04 §4.11): apply one compounding
 * monthly accrual per whole elapsed month since lastAccruedAt. A null
 * lastAccruedAt just starts the clock (no retroactive growth).
 */
export function yieldCatchUp(
  investmentBalance: Money,
  rateBps: number,
  ratePeriod: RatePeriod,
  lastAccruedAt: Date | null,
  now: Date,
): YieldCatchUp {
  if (lastAccruedAt === null) {
    return { months: 0, accrued: 0, newBalance: investmentBalance, nextLastAccruedAt: now };
  }
  const months = wholeMonthsBetween(lastAccruedAt, now);
  let balance = investmentBalance;
  let accrued = 0;
  for (let i = 0; i < months; i += 1) {
    const accrual = monthlyYieldAccrual(balance, rateBps, ratePeriod);
    balance += accrual;
    accrued += accrual;
  }
  return {
    months,
    accrued,
    newBalance: balance,
    nextLastAccruedAt: months > 0 ? addMonthsToTimestamp(lastAccruedAt, months) : lastAccruedAt,
  };
}
