import { db } from "@balance-point/db";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { buildProjection } from "../lib/projection";
import { buildProjectionContext } from "../lib/projection-context";
import { monthSchema, moneySchema } from "../lib/validation";

export const projectionRouter = router({
  get: protectedProcedure
    .input(
      z
        .object({
          horizonMonths: z.number().int().min(1).max(60).optional(),
          includeYield: z.boolean().default(true),
          additionalSpend: z.array(z.object({ month: monthSchema, amount: moneySchema })).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const context = await buildProjectionContext(db, ctx.session.user.id, {
        horizonMonths: input?.horizonMonths,
        includeYield: input?.includeYield ?? true,
        additionalSpend: input?.additionalSpend,
        preferredLocale: ctx.preferredLocale,
      });
      const rows = buildProjection(context);
      return {
        seedFreeTotal: context.seedFreeTotal,
        displayCurrency: context.displayCurrency,
        rows,
        warnings: context.warnings,
      };
    }),
});
