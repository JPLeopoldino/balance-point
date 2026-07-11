import { db } from "@balance-point/db";
import { income, incomeOverride } from "@balance-point/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  currencySchema,
  dayOfMonthSchema,
  idSchema,
  monthSchema,
  nonNegativeMoneySchema,
} from "../lib/validation";

export const incomeRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.query.income.findMany({
      where: eq(income.userId, ctx.session.user.id),
      orderBy: [asc(income.createdAt)],
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        amount: nonNegativeMoneySchema,
        currency: currencySchema.default("BRL"),
        dayOfMonth: dayOfMonthSchema.optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(income)
        .values({ ...input, userId: ctx.session.user.id })
        .returning();
      return created!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        amount: nonNegativeMoneySchema.optional(),
        currency: currencySchema.optional(),
        dayOfMonth: dayOfMonthSchema.nullish(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await db.query.income.findFirst({
        where: and(eq(income.id, input.id), eq(income.userId, userId)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Income not found" });
      const { id, ...editable } = input;
      const [updated] = await db
        .update(income)
        .set(editable)
        .where(and(eq(income.id, id), eq(income.userId, userId)))
        .returning();
      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await db.query.income.findFirst({
        where: and(eq(income.id, input.id), eq(income.userId, userId)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Income not found" });
      await db.delete(income).where(and(eq(income.id, input.id), eq(income.userId, userId)));
      return { ok: true as const };
    }),

  listOverrides: protectedProcedure
    .input(z.object({ from: monthSchema.optional(), to: monthSchema.optional() }).optional())
    .query(({ ctx, input }) =>
      db.query.incomeOverride.findMany({
        where: and(
          eq(incomeOverride.userId, ctx.session.user.id),
          input?.from ? gte(incomeOverride.month, input.from) : undefined,
          input?.to ? lte(incomeOverride.month, input.to) : undefined,
        ),
        orderBy: [asc(incomeOverride.month)],
      }),
    ),

  // Overrides are stored in the display currency (doc 04 §4.8).
  setOverride: protectedProcedure
    .input(z.object({ month: monthSchema, amount: nonNegativeMoneySchema }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(incomeOverride)
        .values({ ...input, userId: ctx.session.user.id })
        .onConflictDoUpdate({
          target: [incomeOverride.userId, incomeOverride.month],
          set: { amount: input.amount },
        })
        .returning();
      return row!;
    }),

  clearOverride: protectedProcedure
    .input(z.object({ month: monthSchema }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(incomeOverride)
        .where(
          and(eq(incomeOverride.userId, ctx.session.user.id), eq(incomeOverride.month, input.month)),
        );
      return { ok: true as const };
    }),
});
