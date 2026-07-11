import { bigint, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { id, userId } from "./_shared";
import { currencyEnum } from "./enums";

export const exchangeRate = pgTable(
  "exchange_rate",
  {
    id: id(),
    userId: userId(),
    base: currencyEnum("base").notNull(),
    quote: currencyEnum("quote").notNull(),
    // Scaled by FX_SCALE = 1e6: 1 USD = 5.43 BRL → base USD, quote BRL, rate 5_430_000.
    rate: bigint("rate", { mode: "number" }).notNull(),
    source: text("source").notNull().default("manual"),
    asOf: timestamp("as_of").defaultNow().notNull(),
  },
  // uniqueIndex (not `unique`): drizzle-kit push mis-introspects unique
  // CONSTRAINTS over enum columns and re-prompts on every push.
  (t) => [uniqueIndex("exchange_rate_user_pair").on(t.userId, t.base, t.quote)],
);
