import { db } from "@balance-point/db";
import { bankAccount, bill, purchasePlan } from "@balance-point/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { logActivity } from "../lib/activity";
import { createSafeConverter, loadFxRates } from "../lib/fx";
import { normalizeLocale } from "../lib/locale";
import { monthDiff } from "../lib/month";
import { planOutflows } from "../lib/plan";
import { buildProjection } from "../lib/projection";
import { buildProjectionContext } from "../lib/projection-context";
import { currencySchema, idSchema, isoDateSchema, positiveMoneySchema } from "../lib/validation";

async function ownedPlan(userId: string, id: string) {
  const row = await db.query.purchasePlan.findFirst({
    where: and(eq(purchasePlan.id, id), eq(purchasePlan.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase plan not found" });
  return row;
}

const planShape = z.object({
  name: z.string().min(1),
  totalAmount: positiveMoneySchema,
  currency: currencySchema.default("BRL"),
  mode: z.enum(["lump_sum", "installments"]).default("lump_sum"),
  installments: z.number().int().min(2).max(120).optional(),
  startDate: isoDateSchema,
  sourceAccountId: idSchema,
  notes: z.string().optional(),
});

function validatePlanShape(input: { mode: string; installments?: number | null }) {
  if (input.mode === "installments" && !input.installments) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "installments is required for installment plans",
    });
  }
}

export const plansRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.query.purchasePlan.findMany({
      where: eq(purchasePlan.userId, ctx.session.user.id),
      orderBy: [desc(purchasePlan.createdAt)],
      with: { sourceAccount: { columns: { id: true, name: true, currency: true } } },
    }),
  ),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => ownedPlan(ctx.session.user.id, input.id)),

  create: protectedProcedure.input(planShape).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    validatePlanShape(input);
    const account = await db.query.bankAccount.findFirst({
      where: and(eq(bankAccount.id, input.sourceAccountId), eq(bankAccount.userId, userId)),
    });
    if (!account) throw new TRPCError({ code: "FORBIDDEN", message: "Source account not found" });
    const [created] = await db
      .insert(purchasePlan)
      .values({ ...input, userId })
      .returning();
    return created!;
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        totalAmount: positiveMoneySchema.optional(),
        currency: currencySchema.optional(),
        mode: z.enum(["lump_sum", "installments"]).optional(),
        installments: z.number().int().min(2).max(120).nullish(),
        startDate: isoDateSchema.optional(),
        sourceAccountId: idSchema.optional(),
        notes: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ownedPlan(userId, input.id);
      // A committed plan already generated bills; edit those, not the plan.
      const structural =
        input.totalAmount !== undefined ||
        input.mode !== undefined ||
        input.installments !== undefined ||
        input.startDate !== undefined ||
        input.currency !== undefined;
      if (existing.status === "committed" && structural) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan is committed — edit its generated bills instead.",
        });
      }
      if (input.sourceAccountId) {
        const account = await db.query.bankAccount.findFirst({
          where: and(eq(bankAccount.id, input.sourceAccountId), eq(bankAccount.userId, userId)),
        });
        if (!account) throw new TRPCError({ code: "FORBIDDEN", message: "Source account not found" });
      }
      const { id, ...editable } = input;
      const [updated] = await db
        .update(purchasePlan)
        .set(editable)
        .where(and(eq(purchasePlan.id, id), eq(purchasePlan.userId, userId)))
        .returning();
      return updated!;
    }),

  // Deleting a committed plan removes its future UNPAID bills; paid history stays (§4.12).
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ownedPlan(userId, input.id);
      return db.transaction(async (tx) => {
        if (existing.status === "committed") {
          await tx
            .delete(bill)
            .where(
              and(eq(bill.userId, userId), eq(bill.purchasePlanId, existing.id), eq(bill.paid, false)),
            );
        }
        await tx
          .delete(purchasePlan)
          .where(and(eq(purchasePlan.id, existing.id), eq(purchasePlan.userId, userId)));
        return { ok: true as const };
      });
    }),

  /**
   * What-if series (doc 04 §4.12): global baseline projection vs. the same
   * series minus the plan's outflows, all in the display currency.
   */
  simulate: protectedProcedure
    .input(
      z.object({
        id: idSchema.optional(),
        name: z.string().optional(),
        totalAmount: positiveMoneySchema.optional(),
        currency: currencySchema.optional(),
        mode: z.enum(["lump_sum", "installments"]).optional(),
        installments: z.number().int().min(2).max(120).optional(),
        startDate: isoDateSchema.optional(),
        sourceAccountId: idSchema.optional(),
        horizonMonths: z.number().int().min(1).max(60).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const stored = input.id ? await ownedPlan(userId, input.id) : null;

      const plan = {
        totalAmount: input.totalAmount ?? stored?.totalAmount,
        currency: input.currency ?? stored?.currency ?? ("BRL" as const),
        mode: input.mode ?? stored?.mode ?? ("lump_sum" as const),
        installments: input.installments ?? stored?.installments ?? null,
        startDate: input.startDate ?? stored?.startDate,
      };
      if (!plan.totalAmount || !plan.startDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide a plan id or totalAmount + startDate to simulate.",
        });
      }
      validatePlanShape(plan);

      const outflows = planOutflows({
        totalAmount: plan.totalAmount,
        mode: plan.mode,
        installments: plan.installments,
        startDate: plan.startDate,
      });
      const lastOutflowMonth = outflows[outflows.length - 1]!.month;

      const settingsProbe = await buildProjectionContext(db, userId, {
        horizonMonths: 1,
        preferredLocale: ctx.preferredLocale,
      });
      const neededHorizon = Math.max(
        input.horizonMonths ?? settingsProbe.settings.projectionHorizonMonths,
        monthDiff(settingsProbe.thisMonth, lastOutflowMonth) + 1,
      );
      const context = await buildProjectionContext(db, userId, { horizonMonths: neededHorizon });
      const baseline = buildProjection(context);

      const rates = await loadFxRates(db, userId);
      const { conv } = createSafeConverter(
        rates,
        context.displayCurrency,
        normalizeLocale(context.settings.locale),
      );
      const outflowByMonth = new Map(
        outflows.map((o) => [o.month, conv(o.amount, plan.currency)]),
      );

      // Outflows before the first projected month reduce the seed immediately.
      let pastOutflow = 0;
      for (const o of outflows) {
        if (o.month <= context.thisMonth) pastOutflow += conv(o.amount, plan.currency);
      }

      let cumulative = pastOutflow;
      let minBalance = Number.MAX_SAFE_INTEGER;
      let firstNegativeMonth: string | null = null;
      const rows = baseline.map((row) => {
        cumulative += outflowByMonth.get(row.month) ?? 0;
        const balanceWithPlan = row.projectedBalance - cumulative;
        if (balanceWithPlan < minBalance) minBalance = balanceWithPlan;
        if (balanceWithPlan < 0 && firstNegativeMonth === null) firstNegativeMonth = row.month;
        return {
          month: row.month,
          baselineBalance: row.projectedBalance,
          planOutflow: outflowByMonth.get(row.month) ?? 0,
          balanceWithPlan,
        };
      });

      return {
        rows,
        displayCurrency: context.displayCurrency,
        minBalance: rows.length > 0 ? minBalance : 0,
        firstNegativeMonth,
        affordable: firstNegativeMonth === null,
        warnings: context.warnings,
      };
    }),

  /** Commit (§4.12): draft → committed, generating real bills per outflow. */
  commit: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const plan = await ownedPlan(userId, input.id);
      if (plan.status === "committed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan is already committed" });
      }
      const outflows = planOutflows(plan);

      return db.transaction(async (tx) => {
        const bills = await tx
          .insert(bill)
          .values(
            outflows.map((o) => ({
              userId,
              name:
                o.installmentTotal !== null
                  ? `${plan.name} (${o.installmentNumber}/${o.installmentTotal})`
                  : plan.name,
              amount: o.amount,
              currency: plan.currency,
              dueDate: o.dueDate,
              month: o.month,
              paid: false,
              sourceAccountId: plan.sourceAccountId,
              purchasePlanId: plan.id,
              installmentNumber: o.installmentNumber,
              installmentTotal: o.installmentTotal,
            })),
          )
          .returning();

        const [updated] = await tx
          .update(purchasePlan)
          .set({ status: "committed" })
          .where(and(eq(purchasePlan.id, plan.id), eq(purchasePlan.userId, userId)))
          .returning();

        await logActivity(tx, {
          userId,
          type: "plan_committed",
          bankAccountId: plan.sourceAccountId,
          meta: { planId: plan.id, name: plan.name, bills: bills.length },
        });

        return { plan: updated!, bills };
      });
    }),
});
