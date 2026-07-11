import { activityLog } from "@balance-point/db/schema/index";
import type { Money } from "@balance-point/money";

import type { DbLike } from "./db-types";

type ActivityType = (typeof activityLog.type.enumValues)[number];

export interface ActivityInput {
  userId: string;
  type: ActivityType;
  bankAccountId?: string | null;
  billId?: string | null;
  /** Signed delta in the affected account's currency. */
  amount?: Money | null;
  balanceAfter?: Money | null;
  meta?: Record<string, unknown> | null;
}

export async function logActivity(db: DbLike, input: ActivityInput) {
  await db.insert(activityLog).values({
    userId: input.userId,
    type: input.type,
    bankAccountId: input.bankAccountId ?? null,
    billId: input.billId ?? null,
    amount: input.amount ?? null,
    balanceAfter: input.balanceAfter ?? null,
    meta: input.meta ?? null,
  });
}
