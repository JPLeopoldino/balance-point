import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, money, userId } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { bill } from "./bills";
import { activityTypeEnum } from "./enums";

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    userId: userId(),
    type: activityTypeEnum("type").notNull(),
    bankAccountId: text("bank_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    billId: text("bill_id").references(() => bill.id, { onDelete: "set null" }),
    amount: money("amount"), // signed delta in the account's currency
    balanceAfter: money("balance_after"),
    meta: jsonb("meta"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => [index("activity_user_idx").on(t.userId, t.occurredAt)],
);
