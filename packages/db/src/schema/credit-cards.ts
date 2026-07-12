import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { currencyEnum } from "./enums";

export const creditCard = pgTable(
  "credit_card",
  {
    id: id(),
    userId: userId(),
    // Optional host account — a card can live on its own (§4.3).
    bankAccountId: text("bank_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    brand: text("brand"),
    creditLimit: money("credit_limit").notNull(),
    currency: currencyEnum("currency").notNull().default("BRL"),
    closingDay: integer("closing_day"),
    dueDay: integer("due_day"),
    color: text("color"),
    icon: text("icon"),
    archived: boolean("archived").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("credit_card_user_idx").on(t.userId),
    index("credit_card_account_idx").on(t.bankAccountId),
  ],
);
// used/available credit are DERIVED (doc 04 §4.3) — never stored.
