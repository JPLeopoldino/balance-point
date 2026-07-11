import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { compoundingEnum, currencyEnum, ratePeriodEnum } from "./enums";

export const bankAccount = pgTable(
  "bank_account",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    institution: text("institution"),
    checkingBalance: money("checking_balance").notNull().default(0),
    investmentBalance: money("investment_balance").notNull().default(0),
    currency: currencyEnum("currency").notNull().default("BRL"),
    color: text("color"),
    icon: text("icon"),
    archived: boolean("archived").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("bank_account_user_idx").on(t.userId)],
);
// NOTE: credit limits live on `credit_card`, not the account.

export const yieldConfig = pgTable(
  "yield_config",
  {
    id: id(),
    userId: userId(),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccount.id, { onDelete: "cascade" })
      .unique(),
    // Basis points to stay integer: 13.75% → 1375. Interpreted per ratePeriod:
    // 'annual' divides by 12 for the monthly accrual; 'monthly' applies as-is
    // (the owner's account is quoted as a monthly CDI-relative rate).
    rateBps: integer("rate_bps").notNull(),
    ratePeriod: ratePeriodEnum("rate_period").notNull().default("annual"),
    compounding: compoundingEnum("compounding").notNull().default("monthly"),
    enabled: boolean("enabled").notNull().default(true),
    lastAccruedAt: timestamp("last_accrued_at"),
    ...timestamps,
  },
  (t) => [index("yield_config_user_idx").on(t.userId)],
);
