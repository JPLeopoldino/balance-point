import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { category } from "./categories";
import { creditCard } from "./credit-cards";
import { currencyEnum } from "./enums";
import { purchasePlan } from "./plans";
import { recurringExpense } from "./recurring";

export const bill = pgTable(
  "bill",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    amount: money("amount").notNull(), // > 0
    currency: currencyEnum("currency").notNull().default("BRL"),
    dueDate: date("due_date", { mode: "string" }).notNull(), // 'YYYY-MM-DD'
    month: text("month").notNull(), // 'YYYY-MM', derived from dueDate on write
    paid: boolean("paid").notNull().default(false),
    paidAt: timestamp("paid_at"),
    paidFromAccountId: text("paid_from_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    // FX rate applied when paid cross-currency (scaled 1e6); replayed on unpay.
    paidFxRate: bigint("paid_fx_rate", { mode: "number" }),
    sourceAccountId: text("source_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    // Card charge if set — settled via the card's statement, never paid directly (§4.5).
    creditCardId: text("credit_card_id").references(() => creditCard.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
    recurringExpenseId: text("recurring_expense_id").references(() => recurringExpense.id, {
      onDelete: "set null",
    }),
    purchasePlanId: text("purchase_plan_id").references(() => purchasePlan.id, {
      onDelete: "set null",
    }),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("bill_user_idx").on(t.userId),
    index("bill_month_idx").on(t.userId, t.month),
    index("bill_due_idx").on(t.userId, t.dueDate),
    index("bill_recurring_month_idx").on(t.recurringExpenseId, t.month), // idempotency (§4.9)
    index("bill_card_idx").on(t.userId, t.creditCardId),
  ],
);
