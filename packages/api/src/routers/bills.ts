import { db } from "@balance-point/db";
import type { BankAccount } from "@balance-point/db/schema/index";
import { bankAccount, bill, category, creditCard } from "@balance-point/db/schema/index";
import { sumMoney } from "@balance-point/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { logActivity } from "../lib/activity";
import { createSafeConverter, loadFxRates } from "../lib/fx";
import { normalizeLocale } from "../lib/locale";
import { messagesFor } from "../lib/messages";
import { currentMonth, monthOfDate, todayISO } from "../lib/month";
import { payBillTx, unpayBillTx } from "../lib/payments";
import { monthRollup } from "../lib/rollups";
import { ensureUserDefaults } from "../lib/seed";
import {
  currencySchema,
  idSchema,
  isoDateSchema,
  monthSchema,
  positiveMoneySchema,
} from "../lib/validation";

async function ownedBill(userId: string, id: string) {
  const row = await db.query.bill.findFirst({
    where: and(eq(bill.id, id), eq(bill.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
  return row;
}

async function assertOwnedRefs(
  userId: string,
  refs: { sourceAccountId?: string | null; creditCardId?: string | null; categoryId?: string | null },
) {
  if (refs.sourceAccountId) {
    const row = await db.query.bankAccount.findFirst({
      where: and(eq(bankAccount.id, refs.sourceAccountId), eq(bankAccount.userId, userId)),
    });
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Source account not found" });
  }
  if (refs.creditCardId) {
    const row = await db.query.creditCard.findFirst({
      where: and(eq(creditCard.id, refs.creditCardId), eq(creditCard.userId, userId)),
    });
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Credit card not found" });
  }
  if (refs.categoryId) {
    const row = await db.query.category.findFirst({
      where: and(eq(category.id, refs.categoryId), eq(category.userId, userId)),
    });
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Category not found" });
  }
}

export const billsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          month: monthSchema.optional(),
          paid: z.boolean().optional(),
          wontPay: z.boolean().optional(),
          categoryId: idSchema.optional(),
          accountId: idSchema.optional(),
          creditCardId: idSchema.optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const useRange = Boolean(input?.from ?? input?.to);
      const month = useRange ? undefined : (input?.month ?? currentMonth());
      return db.query.bill.findMany({
        where: and(
          eq(bill.userId, userId),
          month ? eq(bill.month, month) : undefined,
          input?.from ? gte(bill.dueDate, input.from) : undefined,
          input?.to ? lte(bill.dueDate, input.to) : undefined,
          input?.paid !== undefined ? eq(bill.paid, input.paid) : undefined,
          input?.wontPay !== undefined ? eq(bill.wontPay, input.wontPay) : undefined,
          input?.categoryId ? eq(bill.categoryId, input.categoryId) : undefined,
          input?.accountId ? eq(bill.sourceAccountId, input.accountId) : undefined,
          input?.creditCardId ? eq(bill.creditCardId, input.creditCardId) : undefined,
          input?.search ? ilike(bill.name, `%${input.search}%`) : undefined,
        ),
        orderBy: [asc(bill.dueDate), asc(bill.createdAt)],
        with: {
          category: { columns: { id: true, name: true, color: true, isCreditCard: true } },
          sourceAccount: { columns: { id: true, name: true, currency: true } },
          creditCard: { columns: { id: true, name: true, currency: true } },
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => ownedBill(ctx.session.user.id, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        amount: positiveMoneySchema,
        currency: currencySchema.optional(),
        dueDate: isoDateSchema,
        sourceAccountId: idSchema.optional(),
        creditCardId: idSchema.optional(),
        categoryId: idSchema.optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertOwnedRefs(userId, input);

      // Currency defaults to the source account's (or the card's for card charges).
      let currency = input.currency;
      if (!currency && input.creditCardId) {
        const card = await db.query.creditCard.findFirst({
          where: and(eq(creditCard.id, input.creditCardId), eq(creditCard.userId, userId)),
        });
        currency = card?.currency;
      }
      if (!currency && input.sourceAccountId) {
        const account = await db.query.bankAccount.findFirst({
          where: and(eq(bankAccount.id, input.sourceAccountId), eq(bankAccount.userId, userId)),
        });
        currency = account?.currency;
      }

      const [created] = await db
        .insert(bill)
        .values({
          ...input,
          currency: currency ?? "BRL",
          userId,
          month: monthOfDate(input.dueDate),
        })
        .returning();
      return created!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        amount: positiveMoneySchema.optional(),
        currency: currencySchema.optional(),
        dueDate: isoDateSchema.optional(),
        sourceAccountId: idSchema.nullish(),
        creditCardId: idSchema.nullish(),
        categoryId: idSchema.nullish(),
        notes: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ownedBill(userId, input.id);
      await assertOwnedRefs(userId, input);

      const changesMoney =
        (input.amount !== undefined && input.amount !== existing.amount) ||
        (input.currency !== undefined && input.currency !== existing.currency);
      if (existing.paid && changesMoney) {
        const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: messagesFor(normalizeLocale(settings.locale)).unpayBeforeEditing,
        });
      }

      const { id, ...editable } = input;
      const [updated] = await db
        .update(bill)
        .set({
          ...editable,
          ...(input.dueDate ? { month: monthOfDate(input.dueDate) } : {}),
        })
        .where(and(eq(bill.id, id), eq(bill.userId, userId)))
        .returning();
      return updated!;
    }),

  // Deleting a paid bill reverses the payment first so balances stay right (§4.10).
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const locale = normalizeLocale(settings.locale);
      return db.transaction(async (tx) => {
        const existing = await tx.query.bill.findFirst({
          where: and(eq(bill.id, input.id), eq(bill.userId, userId)),
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
        if (existing.paid) {
          await unpayBillTx(tx, { userId, billId: existing.id, locale });
        }
        await logActivity(tx, {
          userId,
          type: "bill_deleted",
          billId: null,
          bankAccountId: existing.sourceAccountId,
          amount: null,
          balanceAfter: null,
          meta: { name: existing.name, amount: existing.amount, currency: existing.currency },
        });
        await tx.delete(bill).where(and(eq(bill.id, input.id), eq(bill.userId, userId)));
        return { ok: true as const };
      });
    }),

  pay: protectedProcedure
    .input(z.object({ id: idSchema, fromAccountId: idSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const locale = normalizeLocale(settings.locale);
      const rates = await loadFxRates(db, userId);
      const result = await db.transaction((tx) =>
        payBillTx(tx, {
          userId,
          billId: input.id,
          fromAccountId: input.fromAccountId,
          rates,
          locale,
        }),
      );
      return { bill: result.bill, account: result.account, warning: result.warning };
    }),

  unpay: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const locale = normalizeLocale(settings.locale);
      const result = await db.transaction((tx) =>
        unpayBillTx(tx, { userId, billId: input.id, locale }),
      );
      return { bill: result.bill, account: result.account };
    }),

  /** Bulk payment (doc 04 §4.7): one transaction, balances grouped per account. */
  bulkPay: protectedProcedure
    .input(z.object({ ids: z.array(idSchema).min(1), fromAccountId: idSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const locale = normalizeLocale(settings.locale);
      const rates = await loadFxRates(db, userId);
      const { conv, warnings: convWarnings } = createSafeConverter(
        rates,
        settings.displayCurrency,
        locale,
      );

      return db.transaction(async (tx) => {
        let paidCount = 0;
        let skippedCount = 0;
        let totalPaid = 0;
        const warnings: string[] = [];
        const touched = new Map<string, BankAccount>();

        for (const id of input.ids) {
          const result = await payBillTx(tx, {
            userId,
            billId: id,
            fromAccountId: input.fromAccountId,
            rates,
            locale,
          });
          if (result.skipped) {
            skippedCount += 1;
            continue;
          }
          paidCount += 1;
          if (result.account) {
            touched.set(result.account.id, result.account);
            totalPaid += conv(result.debit, result.account.currency);
          }
        }

        for (const account of touched.values()) {
          if (account.checkingBalance < 0) {
            warnings.push(messagesFor(locale).negativeBalanceShort(account.name));
          }
        }

        return {
          paidCount,
          skippedCount,
          totalPaid,
          displayCurrency: settings.displayCurrency,
          accounts: [...touched.values()],
          warnings: [...warnings, ...convWarnings()],
        };
      });
    }),

  /** Flag a bill "won't pay" (or undo): it stays on record but leaves the payable roll-ups. */
  setWontPay: protectedProcedure
    .input(z.object({ id: idSchema, wontPay: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const msg = messagesFor(normalizeLocale(settings.locale));
      return db.transaction(async (tx) => {
        const existing = await tx.query.bill.findFirst({
          where: and(eq(bill.id, input.id), eq(bill.userId, userId)),
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
        if (existing.wontPay === input.wontPay) return existing;
        if (input.wontPay && existing.paid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: msg.unpayBeforeWontPay });
        }
        if (input.wontPay && existing.creditCardId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: msg.cardChargeNotPayable });
        }
        const [updated] = await tx
          .update(bill)
          .set({ wontPay: input.wontPay })
          .where(and(eq(bill.id, existing.id), eq(bill.userId, userId)))
          .returning();
        await logActivity(tx, {
          userId,
          type: input.wontPay ? "bill_wont_pay" : "bill_wont_pay_undone",
          billId: existing.id,
          bankAccountId: existing.sourceAccountId,
          amount: null,
          balanceAfter: null,
          meta: { name: existing.name, amount: existing.amount, currency: existing.currency },
        });
        return updated!;
      });
    }),

  /** Next unpaid bill with value > 0 (doc 04 §4.13). Card charges are not payables. */
  next: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await db.query.bill.findMany({
      where: and(
        eq(bill.userId, userId),
        eq(bill.paid, false),
        eq(bill.wontPay, false),
        gt(bill.amount, 0),
      ),
      orderBy: [asc(bill.dueDate), asc(bill.createdAt)],
      limit: 10,
    });
    const nextBill = rows.find((row) => !row.creditCardId);
    if (!nextBill) return null;
    const today = todayISO();
    const daysUntil = Math.round(
      (Date.parse(`${nextBill.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    );
    return { bill: nextBill, daysUntil };
  }),

  /** 12-month roll-up (doc 02 §2.2-C) in the display currency. */
  monthSummary: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const rates = await loadFxRates(db, userId);
      const { conv } = createSafeConverter(rates, settings.displayCurrency);

      const rows = await db.query.bill.findMany({
        where: and(
          eq(bill.userId, userId),
          gte(bill.month, `${input.year}-01`),
          lte(bill.month, `${input.year}-12`),
        ),
        columns: {
          month: true,
          amount: true,
          currency: true,
          paid: true,
          wontPay: true,
          creditCardId: true,
        },
      });

      return Array.from({ length: 12 }, (_, i) => {
        const month = `${input.year}-${String(i + 1).padStart(2, "0")}`;
        // Card charges are settled via the statement bill — excluding them here
        // keeps the roll-up free of double counting (§4.3).
        const monthBills = rows.filter((r) => r.month === month && !r.creditCardId);
        return { month, ...monthRollup(monthBills, conv) };
      });
    }),

  /** Paid spending grouped by category (doc 04 §4.13), in the display currency. */
  spendingByCategory: protectedProcedure
    .input(
      z
        .object({
          month: monthSchema.optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const rates = await loadFxRates(db, userId);
      const { conv } = createSafeConverter(rates, settings.displayCurrency);
      const useRange = Boolean(input?.from ?? input?.to);
      const month = useRange ? undefined : (input?.month ?? currentMonth());

      const rows = await db.query.bill.findMany({
        where: and(
          eq(bill.userId, userId),
          eq(bill.paid, true),
          month ? eq(bill.month, month) : undefined,
          input?.from ? gte(bill.dueDate, input.from) : undefined,
          input?.to ? lte(bill.dueDate, input.to) : undefined,
        ),
        columns: { amount: true, currency: true, categoryId: true },
        with: { category: { columns: { id: true, name: true, color: true } } },
      });

      const byCategory = new Map<
        string,
        { categoryId: string | null; name: string; color: string | null; total: number }
      >();
      for (const row of rows) {
        const key = row.categoryId ?? "uncategorized";
        const entry = byCategory.get(key) ?? {
          categoryId: row.categoryId,
          name: row.category?.name ?? "Uncategorized",
          color: row.category?.color ?? null,
          total: 0,
        };
        entry.total = sumMoney(entry.total, conv(row.amount, row.currency));
        byCategory.set(key, entry);
      }
      return [...byCategory.values()].sort((a, b) => b.total - a.total);
    }),
});
