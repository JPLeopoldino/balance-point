import { date, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { currencyEnum, planModeEnum, planStatusEnum } from "./enums";

export const purchasePlan = pgTable(
  "purchase_plan",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    totalAmount: money("total_amount").notNull(),
    currency: currencyEnum("currency").notNull().default("BRL"),
    mode: planModeEnum("mode").notNull().default("lump_sum"),
    installments: integer("installments"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    sourceAccountId: text("source_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    status: planStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("plan_user_idx").on(t.userId)],
);
