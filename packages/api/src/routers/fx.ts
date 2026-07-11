import { db } from "@balance-point/db";
import { exchangeRate } from "@balance-point/db/schema/index";
import { MissingFxRateError, convertWithRate, getRate } from "@balance-point/money";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { loadFxRates } from "../lib/fx";
import { fetchUsdBrlRate } from "../lib/fx-feed";
import { currencySchema, moneySchema } from "../lib/validation";

export const fxRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.query.exchangeRate.findMany({
      where: eq(exchangeRate.userId, ctx.session.user.id),
      orderBy: [desc(exchangeRate.asOf)],
    }),
  ),

  setRate: protectedProcedure
    .input(
      z.object({
        base: currencySchema,
        quote: currencySchema,
        rate: z.number().int().positive(), // scaled by 1e6
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.base === input.quote) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Base and quote must differ" });
      }
      const [row] = await db
        .insert(exchangeRate)
        .values({ ...input, userId: ctx.session.user.id, source: "manual", asOf: new Date() })
        .onConflictDoUpdate({
          target: [exchangeRate.userId, exchangeRate.base, exchangeRate.quote],
          set: { rate: input.rate, source: "manual", asOf: new Date() },
        })
        .returning();
      return row!;
    }),

  /** Fetch the USD→BRL rate from the public feeds right now and store it. */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const fetched = await fetchUsdBrlRate();
    if (!fetched) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Could not reach the exchange-rate services — try again or set the rate manually.",
      });
    }
    const [row] = await db
      .insert(exchangeRate)
      .values({
        userId: ctx.session.user.id,
        base: "USD",
        quote: "BRL",
        rate: fetched.rate,
        source: fetched.source,
        asOf: new Date(),
      })
      .onConflictDoUpdate({
        target: [exchangeRate.userId, exchangeRate.base, exchangeRate.quote],
        set: { rate: fetched.rate, source: fetched.source, asOf: new Date() },
      })
      .returning();
    return row!;
  }),

  convert: protectedProcedure
    .input(z.object({ amount: moneySchema, from: currencySchema, to: currencySchema }))
    .query(async ({ ctx, input }) => {
      const rates = await loadFxRates(db, ctx.session.user.id);
      try {
        const rate = getRate(input.from, input.to, rates);
        return { amount: convertWithRate(input.amount, rate), rate };
      } catch (error) {
        if (error instanceof MissingFxRateError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Set the ${error.from}→${error.to} exchange rate first.`,
          });
        }
        throw error;
      }
    }),
});
