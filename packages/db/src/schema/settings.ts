import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, money, timestamps, userId } from "./_shared";
import { currencyEnum } from "./enums";

export const userSettings = pgTable("user_settings", {
  id: id(),
  userId: userId().unique(), // one row per user
  baseCurrency: currencyEnum("base_currency").notNull().default("BRL"),
  displayCurrency: currencyEnum("display_currency").notNull().default("BRL"),
  projectionHorizonMonths: integer("projection_horizon_months").notNull().default(10),
  defaultAdditionalSpend: money("default_additional_spend").notNull().default(0),
  weekStartsOn: integer("week_starts_on").notNull().default(1), // Monday
  locale: text("locale").notNull().default("pt-BR"),
  theme: text("theme").notNull().default("dark"),
  // Daily-automation gate ('YYYY-MM-DD'): yields, recurring bills, subscription
  // auto-pay and card statements run once per calendar day, lazily.
  lastAutoRunDay: text("last_auto_run_day"),
  ...timestamps,
});
