import { db } from "@balance-point/db";
import { bankAccount, bill, creditCard, recurringExpense } from "@balance-point/db/schema/index";
import { sumMoney } from "@balance-point/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { ensureUpToDate } from "../lib/automation";
import { cardUsage } from "../lib/credit";
import { createSafeConverter, loadFxRates } from "../lib/fx";
import { normalizeLocale } from "../lib/locale";
import { ensureUserDefaults } from "../lib/seed";
import { refreshCardStatements } from "../lib/statements";
import { currencySchema, dayOfMonthSchema, idSchema, positiveMoneySchema } from "../lib/validation";

async function ownedCard(userId: string, id: string) {
  const row = await db.query.creditCard.findFirst({
    where: and(eq(creditCard.id, id), eq(creditCard.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Credit card not found" });
  return row;
}

export const cardsRouter = router({
  list: protectedProcedure
    .input(z.object({ bankAccountId: idSchema.optional() }).optional())
    .query(({ ctx, input }) =>
      db.query.creditCard.findMany({
        where: and(
          eq(creditCard.userId, ctx.session.user.id),
          input?.bankAccountId ? eq(creditCard.bankAccountId, input.bankAccountId) : undefined,
        ),
        orderBy: [asc(creditCard.archived), asc(creditCard.sortOrder), asc(creditCard.createdAt)],
        with: { bankAccount: { columns: { id: true, name: true, currency: true } } },
      }),
    ),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => ownedCard(ctx.session.user.id, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        // A card may live without a host account.
        bankAccountId: idSchema.optional(),
        name: z.string().min(1),
        brand: z.string().optional(),
        creditLimit: positiveMoneySchema,
        currency: currencySchema.default("BRL"),
        closingDay: dayOfMonthSchema.optional(),
        dueDay: dayOfMonthSchema.optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.bankAccountId) {
        const host = await db.query.bankAccount.findFirst({
          where: and(eq(bankAccount.id, input.bankAccountId), eq(bankAccount.userId, userId)),
        });
        if (!host) throw new TRPCError({ code: "FORBIDDEN", message: "Host account not found" });
      }
      const existing = await db
        .select({ id: creditCard.id })
        .from(creditCard)
        .where(eq(creditCard.userId, userId));
      const [created] = await db
        .insert(creditCard)
        .values({ ...input, userId, sortOrder: existing.length })
        .returning();
      return created!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        bankAccountId: idSchema.nullish(),
        name: z.string().min(1).optional(),
        brand: z.string().nullish(),
        creditLimit: positiveMoneySchema.optional(),
        currency: currencySchema.optional(),
        closingDay: dayOfMonthSchema.nullish(),
        dueDay: dayOfMonthSchema.nullish(),
        color: z.string().nullish(),
        icon: z.string().nullish(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ownedCard(userId, input.id);
      if (input.bankAccountId) {
        const host = await db.query.bankAccount.findFirst({
          where: and(eq(bankAccount.id, input.bankAccountId), eq(bankAccount.userId, userId)),
        });
        if (!host) throw new TRPCError({ code: "FORBIDDEN", message: "Host account not found" });
      }
      const { id, ...editable } = input;
      const [updated] = await db
        .update(creditCard)
        .set(editable)
        .where(and(eq(creditCard.id, id), eq(creditCard.userId, userId)))
        .returning();
      // Statement schedule changed — regenerate/re-aim the open fatura.
      if (updated!.dueDay !== existing.dueDay || updated!.closingDay !== existing.closingDay) {
        const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
        await refreshCardStatements(userId, normalizeLocale(settings.locale));
      }
      return updated!;
    }),

  archive: protectedProcedure
    .input(z.object({ id: idSchema, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedCard(userId, input.id);
      const [updated] = await db
        .update(creditCard)
        .set({ archived: input.archived })
        .where(and(eq(creditCard.id, input.id), eq(creditCard.userId, userId)))
        .returning();
      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedCard(userId, input.id);
      const [recurringRefs, billRefs, statementRefs] = await Promise.all([
        db
          .select({ id: recurringExpense.id })
          .from(recurringExpense)
          .where(
            and(eq(recurringExpense.userId, userId), eq(recurringExpense.creditCardId, input.id)),
          )
          .limit(1),
        db
          .select({ id: bill.id })
          .from(bill)
          .where(and(eq(bill.userId, userId), eq(bill.creditCardId, input.id)))
          .limit(1),
        db
          .select({ id: bill.id })
          .from(bill)
          .where(and(eq(bill.userId, userId), eq(bill.statementCardId, input.id)))
          .limit(1),
      ]);
      if (recurringRefs.length > 0 || billRefs.length > 0 || statementRefs.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This card has charges assigned to it. Reassign or clear them before deleting the card.",
        });
      }
      await db
        .delete(creditCard)
        .where(and(eq(creditCard.id, input.id), eq(creditCard.userId, userId)));
      return { ok: true as const };
    }),

  /** Derived credit (doc 04 §4.3) — own currency per card + display-currency totals. */
  usage: protectedProcedure
    .input(z.object({ displayCurrency: currencySchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ensureUpToDate(userId, ctx.preferredLocale);
      const settings = await ensureUserDefaults(db, userId, ctx.preferredLocale);
      const displayCurrency = input?.displayCurrency ?? settings.displayCurrency;
      const locale = normalizeLocale(settings.locale);
      const rates = await loadFxRates(db, userId);
      const { conv, warnings } = createSafeConverter(rates, displayCurrency, locale);

      const [cards, activeRecurring, openCardBills] = await Promise.all([
        db.query.creditCard.findMany({
          where: and(eq(creditCard.userId, userId), eq(creditCard.archived, false)),
          orderBy: [asc(creditCard.sortOrder), asc(creditCard.createdAt)],
          with: { bankAccount: { columns: { id: true, name: true, color: true } } },
        }),
        db.query.recurringExpense.findMany({
          where: and(
            eq(recurringExpense.userId, userId),
            eq(recurringExpense.active, true),
            isNotNull(recurringExpense.creditCardId),
          ),
        }),
        db.query.bill.findMany({
          where: and(eq(bill.userId, userId), eq(bill.paid, false), isNotNull(bill.creditCardId)),
          columns: { creditCardId: true, amount: true, currency: true },
        }),
      ]);

      const perCard = cards.map((card) => {
        const { conv: toCard, warnings: cardWarnings } = createSafeConverter(
          rates,
          card.currency,
          locale,
        );
        const usage = cardUsage(
          card.creditLimit,
          activeRecurring.filter((r) => r.creditCardId === card.id),
          openCardBills.filter((b) => b.creditCardId === card.id),
          toCard,
        );
        return { card, usage, warnings: cardWarnings() };
      });

      return {
        totalCreditAvailable: sumMoney(
          ...perCard.map(({ card, usage }) => conv(usage.available, card.currency)),
        ),
        totalUsed: sumMoney(...perCard.map(({ card, usage }) => conv(usage.used, card.currency))),
        totalLimit: sumMoney(
          ...perCard.map(({ card }) => conv(card.creditLimit, card.currency)),
        ),
        totalCommittedMonthly: sumMoney(
          ...perCard.map(({ card, usage }) => conv(usage.committedMonthly, card.currency)),
        ),
        displayCurrency,
        cards: perCard.map(({ card, usage }) => ({
          id: card.id,
          name: card.name,
          bankAccountId: card.bankAccountId,
          accountName: card.bankAccount?.name ?? null,
          // Card color defaults to the host account's (custom color wins).
          color: card.color ?? card.bankAccount?.color ?? null,
          currency: card.currency,
          limit: card.creditLimit,
          committedMonthly: usage.committedMonthly,
          openCharges: usage.openCharges,
          used: usage.used,
          available: usage.available,
          availableInDisplay: conv(usage.available, card.currency),
        })),
        warnings: [...new Set([...warnings(), ...perCard.flatMap((c) => c.warnings)])],
      };
    }),
});
