import {
  bankAccount,
  bill,
  income,
  incomeOverride,
  userSettings,
  yieldConfig,
} from "@balance-point/db/schema/index";
import type { Currency, Money } from "@balance-point/money";
import { monthlyYieldAccrual, sumMoney } from "@balance-point/money";
import { and, eq, gte, isNull, lte } from "drizzle-orm";

import type { Db } from "./db-types";
import { createSafeConverter, loadFxRates } from "./fx";
import { type Locale, normalizeLocale } from "./locale";
import { type Month, addMonths, currentMonth, monthRange } from "./month";
import { monthRollup } from "./rollups";
import { ensureUserDefaults } from "./seed";

export interface ProjectionContext {
  settings: typeof userSettings.$inferSelect;
  displayCurrency: Currency;
  thisMonth: Month;
  months: Month[];
  seedFreeTotal: Money;
  totalMoney: Money;
  wallet: Money;
  monthBillsNow: Money;
  incomeFor: (month: Month) => Money;
  billsFor: (month: Month) => Money;
  additionalFor: (month: Month) => Money;
  yieldFor: (month: Month) => Money;
  warnings: string[];
}

/**
 * Assembles everything doc 04 §4.8 needs, in the display currency: the
 * Free-Total seed, remaining bills per future month, income (with per-month
 * overrides), additional spend and the optional per-month yield term.
 */
export async function buildProjectionContext(
  db: Db,
  userId: string,
  opts: {
    horizonMonths?: number;
    includeYield?: boolean;
    additionalSpend?: { month: Month; amount: Money }[];
    preferredLocale?: Locale | null;
  } = {},
): Promise<ProjectionContext> {
  const settings = await ensureUserDefaults(db, userId, opts.preferredLocale);
  const displayCurrency = settings.displayCurrency;
  const rates = await loadFxRates(db, userId);
  const { conv, warnings } = createSafeConverter(
    rates,
    displayCurrency,
    normalizeLocale(settings.locale),
  );

  const horizon = Math.max(1, opts.horizonMonths ?? settings.projectionHorizonMonths);
  const thisMonth = currentMonth();
  const months = monthRange(addMonths(thisMonth, 1), horizon);
  const lastMonth = months[months.length - 1]!;

  const [accounts, billRows, incomes, overrides, yields] = await Promise.all([
    db.query.bankAccount.findMany({
      where: and(eq(bankAccount.userId, userId), eq(bankAccount.archived, false)),
    }),
    db.query.bill.findMany({
      where: and(
        eq(bill.userId, userId),
        gte(bill.month, thisMonth),
        lte(bill.month, lastMonth),
        isNull(bill.creditCardId), // card charges settle via statements (§4.3)
      ),
      columns: { month: true, amount: true, currency: true, paid: true, wontPay: true },
    }),
    db.query.income.findMany({ where: and(eq(income.userId, userId), eq(income.active, true)) }),
    db.query.incomeOverride.findMany({
      where: and(
        eq(incomeOverride.userId, userId),
        gte(incomeOverride.month, thisMonth),
        lte(incomeOverride.month, lastMonth),
      ),
    }),
    opts.includeYield === false
      ? Promise.resolve([])
      : db.query.yieldConfig.findMany({
          where: and(eq(yieldConfig.userId, userId), eq(yieldConfig.enabled, true)),
        }),
  ]);

  const wallet = sumMoney(...accounts.map((a) => conv(a.checkingBalance, a.currency)));
  const invested = sumMoney(...accounts.map((a) => conv(a.investmentBalance, a.currency)));
  const totalMoney = wallet + invested;

  const billsByMonth = new Map<Month, typeof billRows>();
  for (const row of billRows) {
    const list = billsByMonth.get(row.month) ?? [];
    list.push(row);
    billsByMonth.set(row.month, list);
  }
  const billsFor = (month: Month): Money =>
    monthRollup(billsByMonth.get(month) ?? [], conv).remainingBills;

  const monthBillsNow = billsFor(thisMonth);
  const seedFreeTotal = totalMoney - monthBillsNow;

  const baselineIncome = sumMoney(...incomes.map((i) => conv(i.amount, i.currency)));
  const overrideMap = new Map(overrides.map((o) => [o.month, o.amount]));
  const incomeFor = (month: Month): Money => overrideMap.get(month) ?? baselineIncome;

  const additionalMap = new Map((opts.additionalSpend ?? []).map((o) => [o.month, o.amount]));
  const additionalFor = (month: Month): Money =>
    additionalMap.get(month) ?? settings.defaultAdditionalSpend;

  // Pre-simulate compounding yield per account so lookups are order-independent.
  const yieldByMonth = new Map<Month, Money>();
  if (yields.length > 0) {
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const simBalances = new Map<string, Money>();
    for (const cfg of yields) {
      const account = accountById.get(cfg.bankAccountId);
      if (account) simBalances.set(cfg.bankAccountId, account.investmentBalance);
    }
    for (const month of months) {
      let total = 0;
      for (const cfg of yields) {
        const account = accountById.get(cfg.bankAccountId);
        if (!account) continue;
        const balance = simBalances.get(cfg.bankAccountId) ?? 0;
        const accrual = monthlyYieldAccrual(balance, cfg.rateBps, cfg.ratePeriod);
        simBalances.set(cfg.bankAccountId, balance + accrual);
        total += conv(accrual, account.currency);
      }
      yieldByMonth.set(month, total);
    }
  }
  const yieldFor = (month: Month): Money => yieldByMonth.get(month) ?? 0;

  return {
    settings,
    displayCurrency,
    thisMonth,
    months,
    seedFreeTotal,
    totalMoney,
    wallet,
    monthBillsNow,
    incomeFor,
    billsFor,
    additionalFor,
    yieldFor,
    warnings: warnings(),
  };
}
