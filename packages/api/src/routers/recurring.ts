import { db } from "@balance-point/db";
import type { Bill, RecurringExpense } from "@balance-point/db/schema/index";
import { bankAccount, bill, category, creditCard, recurringExpense } from "@balance-point/db/schema/index";
import { sumMoney } from "@balance-point/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { monthlyEquivalent } from "../lib/credit";
import type { Tx } from "../lib/db-types";
import { createSafeConverter, loadFxRates } from "../lib/fx";
import { normalizeLocale } from "../lib/locale";
import { addMonths, currentMonth, todayISO } from "../lib/month";
import { enumerateOccurrences } from "../lib/recurrence";
import { ensureUserDefaults } from "../lib/seed";
import {
  currencySchema,
  dayOfMonthSchema,
  idSchema,
  isoDateSchema,
  monthSchema,
  positiveMoneySchema,
} from "../lib/validation";

async function ownedTemplate(userId: string, id: string) {
  const row = await db.query.recurringExpense.findFirst({
    where: and(eq(recurringExpense.id, id), eq(recurringExpense.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Recurring expense not found" });
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

const endModeFields = z.object({
  endMode: z.enum(["infinite", "until_date", "installments"]).default("infinite"),
  endDate: isoDateSchema.optional(),
  installmentsTotal: z.number().int().min(1).optional(),
});

function validateEndMode(input: z.infer<typeof endModeFields>) {
  if (input.endMode === "until_date" && !input.endDate) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "endDate is required for until_date" });
  }
  if (input.endMode === "installments" && !input.installmentsTotal) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "installmentsTotal is required for installments",
    });
  }
}

/**
 * Idempotent generation (doc 04 §4.9): fills only the months that don't have a
 * bill for `(recurringExpenseId, month)` yet. Card-charge templates never
 * materialize payable bills — they feed the card's used credit instead (§4.3).
 */
async function generateForTemplate(
  tx: Tx,
  template: RecurringExpense,
  throughMonth: string,
): Promise<Bill[]> {
  if (!template.active || template.creditCardId) return [];

  const occurrences = enumerateOccurrences(template, throughMonth);
  if (occurrences.length === 0) return [];

  const existing = await tx
    .select({ month: bill.month })
    .from(bill)
    .where(eq(bill.recurringExpenseId, template.id));
  const existingMonths = new Set(existing.map((r) => r.month));

  const missing = occurrences.filter((o) => !existingMonths.has(o.month));
  if (missing.length === 0) return [];

  const created = await tx
    .insert(bill)
    .values(
      missing.map((o) => ({
        userId: template.userId,
        name: template.name,
        amount: template.defaultAmount,
        currency: template.currency,
        dueDate: o.dueDate,
        month: o.month,
        paid: false,
        sourceAccountId: template.sourceAccountId,
        categoryId: template.categoryId,
        recurringExpenseId: template.id,
        installmentNumber: o.installmentNumber,
        installmentTotal:
          template.endMode === "installments" ? template.installmentsTotal : null,
      })),
    )
    .returning();

  if (template.endMode === "installments") {
    await tx
      .update(recurringExpense)
      .set({ installmentsGenerated: existingMonths.size + created.length })
      .where(eq(recurringExpense.id, template.id));
  }
  return created;
}

export const recurringRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: z.enum(["bill", "subscription"]).optional() }).optional())
    .query(({ ctx, input }) =>
      db.query.recurringExpense.findMany({
        where: and(
          eq(recurringExpense.userId, ctx.session.user.id),
          input?.kind ? eq(recurringExpense.kind, input.kind) : undefined,
        ),
        orderBy: [asc(recurringExpense.name)],
        with: {
          category: { columns: { id: true, name: true, color: true } },
          sourceAccount: { columns: { id: true, name: true, currency: true } },
          creditCard: { columns: { id: true, name: true, currency: true } },
        },
      }),
    ),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => ownedTemplate(ctx.session.user.id, input.id)),

  create: protectedProcedure
    .input(
      z
        .object({
          name: z.string().min(1),
          defaultAmount: positiveMoneySchema,
          currency: currencySchema.default("BRL"),
          kind: z.enum(["bill", "subscription"]).default("bill"),
          categoryId: idSchema.optional(),
          sourceAccountId: idSchema.optional(),
          creditCardId: idSchema.optional(),
          frequency: z.enum(["monthly", "every_n_months", "manual"]).default("monthly"),
          intervalMonths: z.number().int().min(1).max(24).default(1),
          renewDay: dayOfMonthSchema,
          startDate: isoDateSchema,
        })
        .extend(endModeFields.shape),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      validateEndMode(input);
      await assertOwnedRefs(userId, input);
      const [created] = await db
        .insert(recurringExpense)
        .values({ ...input, userId })
        .returning();
      return created!;
    }),

  // Template edits affect FUTURE generations only (§4.9) — existing bills stay.
  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        defaultAmount: positiveMoneySchema.optional(),
        currency: currencySchema.optional(),
        kind: z.enum(["bill", "subscription"]).optional(),
        categoryId: idSchema.nullish(),
        sourceAccountId: idSchema.nullish(),
        creditCardId: idSchema.nullish(),
        frequency: z.enum(["monthly", "every_n_months", "manual"]).optional(),
        intervalMonths: z.number().int().min(1).max(24).optional(),
        renewDay: dayOfMonthSchema.optional(),
        endMode: z.enum(["infinite", "until_date", "installments"]).optional(),
        endDate: isoDateSchema.nullish(),
        installmentsTotal: z.number().int().min(1).nullish(),
        startDate: isoDateSchema.optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ownedTemplate(userId, input.id);
      await assertOwnedRefs(userId, input);
      const merged = {
        endMode: input.endMode ?? existing.endMode,
        endDate: input.endDate === undefined ? (existing.endDate ?? undefined) : (input.endDate ?? undefined),
        installmentsTotal:
          input.installmentsTotal === undefined
            ? (existing.installmentsTotal ?? undefined)
            : (input.installmentsTotal ?? undefined),
      };
      validateEndMode(merged);
      const { id, ...editable } = input;
      const [updated] = await db
        .update(recurringExpense)
        .set(editable)
        .where(and(eq(recurringExpense.id, id), eq(recurringExpense.userId, userId)))
        .returning();
      return updated!;
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: idSchema, active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedTemplate(userId, input.id);
      const [updated] = await db
        .update(recurringExpense)
        .set({ active: input.active })
        .where(and(eq(recurringExpense.id, input.id), eq(recurringExpense.userId, userId)))
        .returning();
      return updated!;
    }),

  // Optionally deletes FUTURE unpaid generated bills; paid history is never touched (§4.10).
  delete: protectedProcedure
    .input(z.object({ id: idSchema, deleteFutureBills: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedTemplate(userId, input.id);
      return db.transaction(async (tx) => {
        let deletedBills = 0;
        if (input.deleteFutureBills) {
          const deleted = await tx
            .delete(bill)
            .where(
              and(
                eq(bill.userId, userId),
                eq(bill.recurringExpenseId, input.id),
                eq(bill.paid, false),
                gte(bill.dueDate, todayISO()),
              ),
            )
            .returning({ id: bill.id });
          deletedBills = deleted.length;
        }
        await tx
          .delete(recurringExpense)
          .where(and(eq(recurringExpense.id, input.id), eq(recurringExpense.userId, userId)));
        return { ok: true as const, deletedBills };
      });
    }),

  preview: protectedProcedure
    .input(z.object({ id: idSchema, throughMonth: monthSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const template = await ownedTemplate(userId, input.id);
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const throughMonth =
        input.throughMonth ?? addMonths(currentMonth(), settings.projectionHorizonMonths);

      if (template.creditCardId) return [];
      const occurrences = enumerateOccurrences(template, throughMonth);
      if (occurrences.length === 0) return [];
      const existing = await db
        .select({ month: bill.month })
        .from(bill)
        .where(eq(bill.recurringExpenseId, template.id));
      const existingMonths = new Set(existing.map((r) => r.month));
      return occurrences.map((o) => ({
        month: o.month,
        dueDate: o.dueDate,
        amount: template.defaultAmount,
        currency: template.currency,
        installmentNumber: o.installmentNumber,
        alreadyExists: existingMonths.has(o.month),
      }));
    }),

  generate: protectedProcedure
    .input(z.object({ id: idSchema.optional(), throughMonth: monthSchema.optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const throughMonth =
        input?.throughMonth ?? addMonths(currentMonth(), settings.projectionHorizonMonths);

      const templates = input?.id
        ? [await ownedTemplate(userId, input.id)]
        : await db.query.recurringExpense.findMany({
            where: and(eq(recurringExpense.userId, userId), eq(recurringExpense.active, true)),
          });

      return db.transaction(async (tx) => {
        const bills: Bill[] = [];
        for (const template of templates) {
          bills.push(...(await generateForTemplate(tx, template, throughMonth)));
        }
        return { created: bills.length, bills };
      });
    }),

  /** Subscriptions header totals (doc 04 §4.4), in the display currency. */
  subscriptionTotals: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
    const rates = await loadFxRates(db, userId);
    const { conv, warnings } = createSafeConverter(
      rates,
      settings.displayCurrency,
      normalizeLocale(settings.locale),
    );

    const active = await db.query.recurringExpense.findMany({
      where: and(eq(recurringExpense.userId, userId), eq(recurringExpense.active, true)),
    });

    const subsMonthly = sumMoney(
      ...active
        .filter((r) => r.kind === "subscription")
        .map((r) => conv(monthlyEquivalent(r), r.currency)),
    );
    const monthlyCreditCost = sumMoney(
      ...active.filter((r) => r.creditCardId).map((r) => conv(monthlyEquivalent(r), r.currency)),
    );
    return { subsMonthly, monthlyCreditCost, warnings: warnings() };
  }),
});
