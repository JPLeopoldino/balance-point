import { db } from "@balance-point/db";
import {
  bankAccount,
  bill,
  creditCard,
  recurringExpense,
} from "@balance-point/db/schema/index";
import { sumMoney } from "@balance-point/money";
import { and, asc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { cardUsage, monthlyEquivalent } from "../lib/credit";
import { createSafeConverter, loadFxRates } from "../lib/fx";
import { refreshUsdBrlIfStale } from "../lib/fx-feed";
import { normalizeLocale } from "../lib/locale";
import { addMonths, currentMonth, todayISO } from "../lib/month";
import { monthRollup } from "../lib/rollups";
import { ensureUserDefaults } from "../lib/seed";
import { currencySchema } from "../lib/validation";

export const dashboardRouter = router({
  /** One call powering the whole dashboard (doc 07 §7.8, rules in doc 04 §4.2–4.4). */
  summary: protectedProcedure
    .input(z.object({ displayCurrency: currencySchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const displayCurrency = input?.displayCurrency ?? settings.displayCurrency;
      // Automatic conversion: pull a fresh USD→BRL quote at most once a day,
      // silently keeping the stored rate when the feeds are unreachable.
      await refreshUsdBrlIfStale(db, userId).catch(() => undefined);
      const rates = await loadFxRates(db, userId);
      const { conv, warnings } = createSafeConverter(
        rates,
        displayCurrency,
        normalizeLocale(settings.locale),
      );

      const thisMonth = currentMonth();
      const nextMonth = addMonths(thisMonth, 1);

      const [accounts, cards, monthBillRows, activeRecurring, openCardBills, unpaidRows] =
        await Promise.all([
          db.query.bankAccount.findMany({
            where: and(eq(bankAccount.userId, userId), eq(bankAccount.archived, false)),
            orderBy: [asc(bankAccount.sortOrder), asc(bankAccount.createdAt)],
          }),
          db.query.creditCard.findMany({
            where: and(eq(creditCard.userId, userId), eq(creditCard.archived, false)),
            orderBy: [asc(creditCard.sortOrder), asc(creditCard.createdAt)],
          }),
          db.query.bill.findMany({
            where: and(
              eq(bill.userId, userId),
              inArray(bill.month, [thisMonth, nextMonth]),
              isNull(bill.creditCardId), // card charges settle via statement bills (§4.3)
            ),
            columns: { month: true, amount: true, currency: true, paid: true },
          }),
          db.query.recurringExpense.findMany({
            where: and(eq(recurringExpense.userId, userId), eq(recurringExpense.active, true)),
          }),
          db.query.bill.findMany({
            where: and(eq(bill.userId, userId), eq(bill.paid, false), isNotNull(bill.creditCardId)),
            columns: { creditCardId: true, amount: true, currency: true },
          }),
          db.query.bill.findMany({
            where: and(eq(bill.userId, userId), eq(bill.paid, false), gt(bill.amount, 0)),
            orderBy: [asc(bill.dueDate), asc(bill.createdAt)],
            limit: 10,
          }),
        ]);

      // §4.2 — balances, converted to the display currency
      const wallet = sumMoney(...accounts.map((a) => conv(a.checkingBalance, a.currency)));
      const invested = sumMoney(...accounts.map((a) => conv(a.investmentBalance, a.currency)));
      const totalMoney = wallet + invested;

      // §4.4 — month roll-ups; "Month bills" is the REMAINING figure
      const thisRollup = monthRollup(
        monthBillRows.filter((b) => b.month === thisMonth),
        conv,
      );
      const nextRollup = monthRollup(
        monthBillRows.filter((b) => b.month === nextMonth),
        conv,
      );
      const monthBills = thisRollup.remainingBills;
      const nextMonthBills = nextRollup.remainingBills;
      const freeMonth = wallet - monthBills;
      const freeTotal = totalMoney - monthBills;

      // §4.3 — derived credit per card + Total Credit KPI
      const accountById = new Map(accounts.map((a) => [a.id, a]));
      const cardFacets = cards.map((card) => {
        const { conv: toCard } = createSafeConverter(rates, card.currency);
        const usage = cardUsage(
          card.creditLimit,
          activeRecurring.filter((r) => r.creditCardId === card.id),
          openCardBills.filter((b) => b.creditCardId === card.id),
          toCard,
        );
        return {
          id: card.id,
          name: card.name,
          // Defaults to the host account's color (custom card color wins).
          color: card.color ?? accountById.get(card.bankAccountId)?.color ?? null,
          currency: card.currency,
          limit: card.creditLimit,
          used: usage.used,
          available: usage.available,
        };
      });
      const totalCredit = sumMoney(...cardFacets.map((c) => conv(c.available, c.currency)));

      // §4.4 — subscriptions & monthly credit cost metrics
      const subscriptionsMonthly = sumMoney(
        ...activeRecurring
          .filter((r) => r.kind === "subscription")
          .map((r) => conv(monthlyEquivalent(r), r.currency)),
      );
      const monthlyCreditCost = sumMoney(
        ...activeRecurring
          .filter((r) => r.creditCardId)
          .map((r) => conv(monthlyEquivalent(r), r.currency)),
      );

      // §4.13 — next payable bills (card charges are not payables)
      const today = todayISO();
      const upcomingBills = unpaidRows
        .filter((row) => !row.creditCardId)
        .slice(0, 3)
        .map((row) => ({
          bill: row,
          daysUntil: Math.round(
            (Date.parse(`${row.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
              86_400_000,
          ),
        }));
      const nextBill = upcomingBills[0] ?? null;

      return {
        displayCurrency,
        wallet,
        invested,
        totalMoney,
        monthBills,
        monthBillsTotal: thisRollup.totalBills,
        monthBillsPaid: thisRollup.paidBills,
        nextMonthBills,
        freeMonth,
        freeTotal,
        freeMonthNext: freeMonth - nextMonthBills,
        freeTotalNext: freeTotal - nextMonthBills,
        totalCredit,
        subscriptionsMonthly,
        monthlyCreditCost,
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          color: a.color,
          icon: a.icon,
          currency: a.currency,
          checking: a.checkingBalance,
          investment: a.investmentBalance,
        })),
        cards: cardFacets,
        nextBill,
        upcomingBills,
        warnings: warnings(),
        currentMonth: thisMonth,
      };
    }),
});
