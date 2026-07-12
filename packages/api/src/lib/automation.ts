import { db } from "@balance-point/db";
import {
  bankAccount,
  bill,
  recurringExpense,
  userSettings,
  yieldConfig,
} from "@balance-point/db/schema/index";
import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { logActivity } from "./activity";
import { loadFxRates } from "./fx";
import { generateForTemplate } from "./generation";
import { type Locale, normalizeLocale } from "./locale";
import { addMonths, currentMonth, todayISO } from "./month";
import { payBillTx } from "./payments";
import { ensureUserDefaults } from "./seed";
import { refreshCardStatements } from "./statements";
import { yieldCatchUp } from "./yield";

/**
 * Lazy daily automation (no cron on Vercel Hobby): the first money query of
 * the day runs the whole routine — yield accrual, recurring-bill generation,
 * subscription auto-pay — and every call refreshes the card statements so
 * faturas track their charges. Each step is idempotent; the calendar-day gate
 * in `user_settings.last_auto_run_day` doubles as a cheap concurrency claim.
 */
export async function ensureUpToDate(userId: string, preferredLocale?: Locale | null) {
  const settings = await ensureUserDefaults(db, userId, preferredLocale);
  const locale = normalizeLocale(settings.locale);
  const today = todayISO();

  if (settings.lastAutoRunDay !== today) {
    const claimed = await db
      .update(userSettings)
      .set({ lastAutoRunDay: today })
      .where(
        and(
          eq(userSettings.userId, userId),
          or(isNull(userSettings.lastAutoRunDay), ne(userSettings.lastAutoRunDay, today)),
        ),
      )
      .returning({ id: userSettings.id });
    if (claimed.length > 0) {
      await accrueYields(userId);
      await generateRecurringBills(userId, settings.projectionHorizonMonths);
      await autoPaySubscriptions(userId, locale);
    }
  }

  await refreshCardStatements(userId, locale);
}

/** Catch-up yield accrual for every enabled config (doc 04 §4.11). */
async function accrueYields(userId: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const configs = await tx.query.yieldConfig.findMany({
      where: and(eq(yieldConfig.userId, userId), eq(yieldConfig.enabled, true)),
    });

    for (const cfg of configs) {
      const account = await tx.query.bankAccount.findFirst({
        where: and(eq(bankAccount.id, cfg.bankAccountId), eq(bankAccount.userId, userId)),
      });
      if (!account) continue;

      const result = yieldCatchUp(
        account.investmentBalance,
        cfg.rateBps,
        cfg.ratePeriod,
        cfg.lastAccruedAt,
        now,
      );
      if (cfg.lastAccruedAt === null) {
        await tx
          .update(yieldConfig)
          .set({ lastAccruedAt: result.nextLastAccruedAt })
          .where(eq(yieldConfig.id, cfg.id));
        continue;
      }
      if (result.months === 0) continue;

      await tx
        .update(bankAccount)
        .set({ investmentBalance: result.newBalance })
        .where(and(eq(bankAccount.id, account.id), eq(bankAccount.userId, userId)));
      await tx
        .update(yieldConfig)
        .set({ lastAccruedAt: result.nextLastAccruedAt })
        .where(eq(yieldConfig.id, cfg.id));
      await logActivity(tx, {
        userId,
        type: "yield_accrued",
        bankAccountId: account.id,
        amount: result.accrued,
        balanceAfter: result.newBalance,
        meta: { months: result.months, rateBps: cfg.rateBps, ratePeriod: cfg.ratePeriod },
      });
    }
  });
}

/** Materialize every active template through the projection horizon (§4.9). */
async function generateRecurringBills(userId: string, horizonMonths: number) {
  const throughMonth = addMonths(currentMonth(), horizonMonths);
  const templates = await db.query.recurringExpense.findMany({
    where: and(eq(recurringExpense.userId, userId), eq(recurringExpense.active, true)),
  });
  if (templates.length === 0) return;
  await db.transaction(async (tx) => {
    for (const template of templates) {
      await generateForTemplate(tx, template, throughMonth);
    }
  });
}

/**
 * Subscriptions charged to a bank account (or to nothing) pay themselves on
 * their due date. Card subscriptions settle via the card's fatura instead.
 */
async function autoPaySubscriptions(userId: string, locale: Locale) {
  const subscriptionTemplates = await db
    .select({ id: recurringExpense.id })
    .from(recurringExpense)
    .where(and(eq(recurringExpense.userId, userId), eq(recurringExpense.kind, "subscription")));
  if (subscriptionTemplates.length === 0) return;

  const due = await db.query.bill.findMany({
    where: and(
      eq(bill.userId, userId),
      eq(bill.paid, false),
      eq(bill.wontPay, false),
      isNull(bill.creditCardId),
      isNotNull(bill.recurringExpenseId),
      lte(bill.dueDate, todayISO()),
      inArray(
        bill.recurringExpenseId,
        subscriptionTemplates.map((t) => t.id),
      ),
    ),
  });
  if (due.length === 0) return;

  const rates = await loadFxRates(db, userId);
  for (const row of due) {
    // Per-bill transaction: one failure (e.g. missing FX rate) must not block
    // the rest — the bill simply stays open for a manual payment.
    await db
      .transaction((tx) => payBillTx(tx, { userId, billId: row.id, rates, locale }))
      .catch(() => undefined);
  }
}
