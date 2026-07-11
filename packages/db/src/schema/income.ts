import { boolean, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { currencyEnum } from "./enums";

export const income = pgTable(
  "income",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    amount: money("amount").notNull(),
    currency: currencyEnum("currency").notNull().default("BRL"),
    dayOfMonth: integer("day_of_month"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("income_user_idx").on(t.userId)],
);

export const incomeOverride = pgTable(
  "income_override",
  {
    id: id(),
    userId: userId(),
    month: text("month").notNull(), // 'YYYY-MM'
    // Stored in the display currency (§4.8).
    amount: money("amount").notNull(),
    ...timestamps,
  },
  (t) => [unique("income_override_user_month").on(t.userId, t.month)],
);
