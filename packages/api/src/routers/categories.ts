import { db } from "@balance-point/db";
import { category } from "@balance-point/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { normalizeLocale } from "../lib/locale";
import { messagesFor } from "../lib/messages";
import { ensureUserDefaults } from "../lib/seed";
import { idSchema } from "../lib/validation";

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function categoryExistsError(userId: string) {
  const settings = await ensureUserDefaults(db, userId);
  return new TRPCError({
    code: "CONFLICT",
    message: messagesFor(normalizeLocale(settings.locale)).categoryExists,
  });
}

export const categoriesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.query.category.findMany({
      where: eq(category.userId, ctx.session.user.id),
      orderBy: [asc(category.name)],
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        color: z.string().optional(),
        icon: z.string().optional(),
        isCreditCard: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [created] = await db
          .insert(category)
          .values({ ...input, userId: ctx.session.user.id })
          .returning();
        return created!;
      } catch (error) {
        if (isUniqueViolation(error)) throw await categoryExistsError(ctx.session.user.id);
        throw error;
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        name: z.string().min(1).optional(),
        color: z.string().nullish(),
        icon: z.string().nullish(),
        isCreditCard: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await db.query.category.findFirst({
        where: and(eq(category.id, input.id), eq(category.userId, userId)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      const { id, ...editable } = input;
      try {
        const [updated] = await db
          .update(category)
          .set(editable)
          .where(and(eq(category.id, id), eq(category.userId, userId)))
          .returning();
        return updated!;
      } catch (error) {
        if (isUniqueViolation(error)) throw await categoryExistsError(userId);
        throw error;
      }
    }),

  // Bills/templates referencing it fall back to Uncategorized via FK `set null` (§4.10).
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await db.query.category.findFirst({
        where: and(eq(category.id, input.id), eq(category.userId, userId)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      await db.delete(category).where(and(eq(category.id, input.id), eq(category.userId, userId)));
      return { ok: true as const };
    }),
});
