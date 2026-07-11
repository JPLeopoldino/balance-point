import { boolean, index, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps, userId } from "./_shared";
import { categoryKindEnum } from "./enums";

export const category = pgTable(
  "category",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull().default("expense"),
    color: text("color"),
    icon: text("icon"),
    isSystem: boolean("is_system").notNull().default(false),
    // Classification only — tags card-statement bills for reporting. Credit
    // capacity (Total Credit) comes from `credit_card` entities, not this flag.
    isCreditCard: boolean("is_credit_card").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("category_user_idx").on(t.userId),
    // Also what makes concurrent first-load seeding idempotent (see api lib/seed).
    unique("category_user_name").on(t.userId, t.name),
  ],
);
