import { db } from "@balance-point/db";
import {
  bankAccount,
  bill,
  creditCard,
  purchasePlan,
  recurringExpense,
  yieldConfig,
} from "@balance-point/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { logActivity } from "../lib/activity";
import { yieldCatchUp } from "../lib/yield";
import { currencySchema, idSchema, moneySchema } from "../lib/validation";

async function ownedAccount(userId: string, id: string) {
  const row = await db.query.bankAccount.findFirst({
    where: and(eq(bankAccount.id, id), eq(bankAccount.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found" });
  return row;
}

export const accountsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.query.bankAccount.findMany({
      where: eq(bankAccount.userId, ctx.session.user.id),
      orderBy: [asc(bankAccount.archived), asc(bankAccount.sortOrder), asc(bankAccount.createdAt)],
    }),
  ),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => ownedAccount(ctx.session.user.id, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        institution: z.string().optional(),
        currency: currencySchema.default("BRL"),
        checkingBalance: moneySchema.default(0),
        investmentBalance: moneySchema.default(0),
        color: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await db
        .select({ id: bankAccount.id })
        .from(bankAccount)
        .where(eq(bankAccount.userId, userId));
      const [created] = await db
        .insert(bankAccount)
        .values({ ...input, userId, sortOrder: existing.length })
        .returning();
      return created!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        institution: z.string().nullish(),
        currency: currencySchema.optional(),
        color: z.string().nullish(),
        icon: z.string().nullish(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedAccount(userId, input.id);
      const { id, ...editable } = input;
      const [updated] = await db
        .update(bankAccount)
        .set(editable)
        .where(and(eq(bankAccount.id, id), eq(bankAccount.userId, userId)))
        .returning();
      return updated!;
    }),

  updateBalance: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        field: z.enum(["checking", "investment"]),
        amount: moneySchema, // absolute new value
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return db.transaction(async (tx) => {
        const row = await tx.query.bankAccount.findFirst({
          where: and(eq(bankAccount.id, input.id), eq(bankAccount.userId, userId)),
        });
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found" });

        const previous = input.field === "checking" ? row.checkingBalance : row.investmentBalance;
        const [updated] = await tx
          .update(bankAccount)
          .set(
            input.field === "checking"
              ? { checkingBalance: input.amount }
              : { investmentBalance: input.amount },
          )
          .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, userId)))
          .returning();

        await logActivity(tx, {
          userId,
          type: "balance_edited",
          bankAccountId: row.id,
          amount: input.amount - previous,
          balanceAfter: input.amount,
          meta: { field: input.field, previous },
        });
        return updated!;
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: idSchema, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedAccount(userId, input.id);
      const [updated] = await db
        .update(bankAccount)
        .set({ archived: input.archived })
        .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, userId)))
        .returning();
      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema, reassignToId: idSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedAccount(userId, input.id);
      if (input.reassignToId === input.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reassign to the same account" });
      }

      return db.transaction(async (tx) => {
        const scoped = and(eq(bill.userId, userId), eq(bill.sourceAccountId, input.id));
        const [unpaidBills, templates, plans, cards] = await Promise.all([
          tx.select({ id: bill.id }).from(bill).where(and(scoped, eq(bill.paid, false))).limit(1),
          tx
            .select({ id: recurringExpense.id })
            .from(recurringExpense)
            .where(
              and(
                eq(recurringExpense.userId, userId),
                eq(recurringExpense.sourceAccountId, input.id),
              ),
            )
            .limit(1),
          tx
            .select({ id: purchasePlan.id })
            .from(purchasePlan)
            .where(
              and(eq(purchasePlan.userId, userId), eq(purchasePlan.sourceAccountId, input.id)),
            )
            .limit(1),
          tx
            .select({ id: creditCard.id })
            .from(creditCard)
            .where(and(eq(creditCard.userId, userId), eq(creditCard.bankAccountId, input.id)))
            .limit(1),
        ]);

        const referenced =
          unpaidBills.length > 0 || templates.length > 0 || plans.length > 0 || cards.length > 0;

        if (referenced && !input.reassignToId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This account is referenced by bills, recurring expenses, plans or cards. Reassign them to another account or archive instead.",
          });
        }

        if (input.reassignToId) {
          const target = await tx.query.bankAccount.findFirst({
            where: and(eq(bankAccount.id, input.reassignToId), eq(bankAccount.userId, userId)),
          });
          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Reassign target account not found" });
          }
          await tx
            .update(bill)
            .set({ sourceAccountId: input.reassignToId })
            .where(and(eq(bill.userId, userId), eq(bill.sourceAccountId, input.id)));
          await tx
            .update(recurringExpense)
            .set({ sourceAccountId: input.reassignToId })
            .where(
              and(
                eq(recurringExpense.userId, userId),
                eq(recurringExpense.sourceAccountId, input.id),
              ),
            );
          await tx
            .update(purchasePlan)
            .set({ sourceAccountId: input.reassignToId })
            .where(
              and(eq(purchasePlan.userId, userId), eq(purchasePlan.sourceAccountId, input.id)),
            );
          await tx
            .update(creditCard)
            .set({ bankAccountId: input.reassignToId })
            .where(and(eq(creditCard.userId, userId), eq(creditCard.bankAccountId, input.id)));
        }

        await tx
          .delete(bankAccount)
          .where(and(eq(bankAccount.id, input.id), eq(bankAccount.userId, userId)));
        return { ok: true as const };
      });
    }),

  // ——— Yield (doc 04 §4.11) ———

  getYield: protectedProcedure
    .input(z.object({ bankAccountId: idSchema }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedAccount(userId, input.bankAccountId);
      const row = await db.query.yieldConfig.findFirst({
        where: and(
          eq(yieldConfig.bankAccountId, input.bankAccountId),
          eq(yieldConfig.userId, userId),
        ),
      });
      return row ?? null;
    }),

  setYield: protectedProcedure
    .input(
      z.object({
        bankAccountId: idSchema,
        enabled: z.boolean(),
        rateBps: z.number().int().nonnegative(),
        ratePeriod: z.enum(["annual", "monthly"]).default("annual"),
        compounding: z.literal("monthly").default("monthly"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedAccount(userId, input.bankAccountId);
      const existing = await db.query.yieldConfig.findFirst({
        where: and(
          eq(yieldConfig.bankAccountId, input.bankAccountId),
          eq(yieldConfig.userId, userId),
        ),
      });
      if (existing) {
        const [updated] = await db
          .update(yieldConfig)
          .set({
            enabled: input.enabled,
            rateBps: input.rateBps,
            ratePeriod: input.ratePeriod,
            compounding: input.compounding,
            // Re-enabling restarts the clock so no retroactive growth applies.
            lastAccruedAt:
              input.enabled && !existing.enabled ? new Date() : existing.lastAccruedAt,
          })
          .where(eq(yieldConfig.id, existing.id))
          .returning();
        return updated!;
      }
      const [created] = await db
        .insert(yieldConfig)
        .values({
          userId,
          bankAccountId: input.bankAccountId,
          enabled: input.enabled,
          rateBps: input.rateBps,
          ratePeriod: input.ratePeriod,
          compounding: input.compounding,
          lastAccruedAt: input.enabled ? new Date() : null,
        })
        .returning();
      return created!;
    }),

  accrueYield: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();
    return db.transaction(async (tx) => {
      const configs = await tx.query.yieldConfig.findMany({
        where: and(eq(yieldConfig.userId, userId), eq(yieldConfig.enabled, true)),
      });
      const accrued: { accountId: string; amount: number }[] = [];

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
        accrued.push({ accountId: account.id, amount: result.accrued });
      }
      return { accrued };
    });
  }),
});
