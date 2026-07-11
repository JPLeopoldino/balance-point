import { db } from "@balance-point/db";
import { userSettings } from "@balance-point/db/schema/index";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { ensureUserDefaults } from "../lib/seed";
import { currencySchema, nonNegativeMoneySchema } from "../lib/validation";

export const settingsRouter = router({
  /**
   * First read seeds default categories, settings and a USD→BRL rate (§7.11).
   * The seeded locale is auto-detected from the browser's Accept-Language.
   */
  get: protectedProcedure.query(({ ctx }) =>
    ensureUserDefaults(db, ctx.session.user.id, ctx.preferredLocale),
  ),

  update: protectedProcedure
    .input(
      z.object({
        baseCurrency: currencySchema.optional(),
        displayCurrency: currencySchema.optional(),
        projectionHorizonMonths: z.number().int().min(1).max(60).optional(),
        defaultAdditionalSpend: nonNegativeMoneySchema.optional(),
        weekStartsOn: z.number().int().min(0).max(6).optional(),
        locale: z.enum(["en", "pt-BR"]).optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ensureUserDefaults(db, userId);
      const [updated] = await db
        .update(userSettings)
        .set(input)
        .where(eq(userSettings.userId, userId))
        .returning();
      return updated!;
    }),
});
