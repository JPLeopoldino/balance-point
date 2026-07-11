import { boolean, date, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { category } from "./categories";
import { creditCard } from "./credit-cards";
import { currencyEnum, endModeEnum, frequencyEnum, recurringKindEnum } from "./enums";

export const recurringExpense = pgTable(
  "recurring_expense",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    defaultAmount: money("default_amount").notNull(),
    currency: currencyEnum("currency").notNull().default("BRL"),
    kind: recurringKindEnum("kind").notNull().default("bill"),
    categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
    sourceAccountId: text("source_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    // Charged to a card if set — this is what consumes the card's credit (§4.3).
    creditCardId: text("credit_card_id").references(() => creditCard.id, { onDelete: "set null" }),
    frequency: frequencyEnum("frequency").notNull().default("monthly"),
    intervalMonths: integer("interval_months").notNull().default(1),
    renewDay: integer("renew_day").notNull(),
    endMode: endModeEnum("end_mode").notNull().default("infinite"),
    endDate: date("end_date", { mode: "string" }),
    installmentsTotal: integer("installments_total"),
    installmentsGenerated: integer("installments_generated").notNull().default(0),
    startDate: date("start_date", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("recurring_user_idx").on(t.userId),
    index("recurring_card_idx").on(t.userId, t.creditCardId),
  ],
);
