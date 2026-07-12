import { db } from "@balance-point/db";
import { activityLog } from "@balance-point/db/schema/index";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { idSchema } from "../lib/validation";

const activityTypes = z.enum([
  "bill_paid",
  "bill_unpaid",
  "bill_wont_pay",
  "bill_wont_pay_undone",
  "bill_deleted",
  "balance_edited",
  "yield_accrued",
  "transfer",
  "plan_committed",
]);

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ o: occurredAt.toISOString(), id })).toString("base64url");
}

function decodeCursor(cursor: string): { o: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      o?: string;
      id?: string;
    };
    if (typeof parsed.o === "string" && typeof parsed.id === "string") {
      return { o: parsed.o, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export const activityRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().optional(),
          accountId: idSchema.optional(),
          type: activityTypes.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 50;
      const decoded = input?.cursor ? decodeCursor(input.cursor) : null;

      const items = await db.query.activityLog.findMany({
        where: and(
          eq(activityLog.userId, userId),
          input?.accountId ? eq(activityLog.bankAccountId, input.accountId) : undefined,
          input?.type ? eq(activityLog.type, input.type) : undefined,
          decoded
            ? or(
                lt(activityLog.occurredAt, new Date(decoded.o)),
                and(
                  eq(activityLog.occurredAt, new Date(decoded.o)),
                  lt(activityLog.id, decoded.id),
                ),
              )
            : undefined,
        ),
        orderBy: [desc(activityLog.occurredAt), desc(activityLog.id)],
        limit: limit + 1,
        with: {
          bankAccount: { columns: { id: true, name: true, currency: true } },
          bill: { columns: { id: true, name: true, amount: true, currency: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const last = items[limit - 1]!;
        nextCursor = encodeCursor(last.occurredAt, last.id);
        items.length = limit;
      }
      return { items, nextCursor };
    }),
});
