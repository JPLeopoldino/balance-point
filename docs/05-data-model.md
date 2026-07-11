# 05 — Data Model (Drizzle / PostgreSQL)

Concrete schema for `packages/db/src/schema/*`. It follows the **existing conventions**
seen in `schema/auth.ts`: `pgTable`, `text` primary keys, `timestamp` audit columns,
explicit indexes, and `relations()`. Add each new file and re‑export it from
`schema/index.ts`, then run `npm run db:push`.

**Money columns are `bigint` minor units** (`{ mode: 'number' }`). **Calendar dates**
(`dueDate`, `startDate`, `endDate`) use `date({ mode: 'string' })` → `'YYYY-MM-DD'`, so no
timezone ever shifts them. **Event timestamps** (`paidAt`, `occurredAt`) use `timestamp`.

IDs: `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`.
Every domain table has `userId → user.id (onDelete: cascade)` and is indexed on it.

---

## 5.1 Shared helpers

```ts
// packages/db/src/schema/_shared.ts
import { bigint, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const id = () =>
  text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

export const userId = () =>
  text("user_id").notNull().references(() => user.id, { onDelete: "cascade" });

/** Money in integer minor units (centavos). */
export const money = (name: string) => bigint(name, { mode: "number" });

export const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
};
```

## 5.2 Enums

```ts
// packages/db/src/schema/enums.ts
import { pgEnum } from "drizzle-orm/pg-core";

export const currencyEnum        = pgEnum("currency", ["BRL", "USD"]);
export const categoryKindEnum    = pgEnum("category_kind", ["expense"]);
export const recurringKindEnum   = pgEnum("recurring_kind", ["bill", "subscription"]);
export const frequencyEnum       = pgEnum("frequency", ["monthly", "every_n_months", "manual"]);
export const endModeEnum         = pgEnum("end_mode", ["infinite", "until_date", "installments"]);
export const compoundingEnum     = pgEnum("compounding", ["monthly"]);
export const planModeEnum        = pgEnum("plan_mode", ["lump_sum", "installments"]);
export const planStatusEnum      = pgEnum("plan_status", ["draft", "committed"]);
export const activityTypeEnum    = pgEnum("activity_type", [
  "bill_paid", "bill_unpaid", "bill_deleted",
  "balance_edited", "yield_accrued", "transfer",
]);
```

## 5.3 Bank accounts + yield

```ts
// packages/db/src/schema/bank-accounts.ts
import { boolean, integer, pgTable, text, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { id, userId, money, timestamps } from "./_shared";
import { currencyEnum, compoundingEnum } from "./enums";

export const bankAccount = pgTable("bank_account", {
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
}, (t) => [index("bank_account_user_idx").on(t.userId)]);
// NOTE: credit limits live on `credit_card` (§5.3a), not the account.

export const yieldConfig = pgTable("yield_config", {
  id: id(),
  userId: userId(),
  bankAccountId: text("bank_account_id").notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }).unique(),
  annualRatePct: integer("annual_rate_bps").notNull(), // store basis points: 13.75% → 1375
  compounding: compoundingEnum("compounding").notNull().default("monthly"),
  enabled: boolean("enabled").notNull().default(true),
  lastAccruedAt: timestamp("last_accrued_at"),
  ...timestamps,
}, (t) => [index("yield_config_user_idx").on(t.userId)]);
// NOTE: store the rate as basis points (integer) to avoid floats. 13.75% = 1375 bps.

export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  yield: one(yieldConfig),
  bills: many(/* bill */ undefined as never),
}));
```

> `annualRatePct` is stored as **basis points** (`integer`) to keep everything integer:
> `13.75%` → `1375`. Convert at the edge.

## 5.3a Credit cards + exchange rates

```ts
// packages/db/src/schema/credit-cards.ts
import { boolean, integer, pgTable, text, index } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { currencyEnum } from "./enums";

export const creditCard = pgTable("credit_card", {
  id: id(),
  userId: userId(),
  bankAccountId: text("bank_account_id").notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  creditLimit: money("credit_limit").notNull(),
  currency: currencyEnum("currency").notNull().default("BRL"),
  closingDay: integer("closing_day"),   // 1..31, optional
  dueDay: integer("due_day"),           // 1..31, optional
  color: text("color"),
  icon: text("icon"),
  archived: boolean("archived").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("credit_card_user_idx").on(t.userId),
  index("credit_card_account_idx").on(t.bankAccountId),
]);
// used/available credit are DERIVED (doc 04 §4.3) — never stored.
```

```ts
// packages/db/src/schema/exchange-rates.ts
import { bigint, pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { id, userId } from "./_shared";
import { currencyEnum } from "./enums";

export const exchangeRate = pgTable("exchange_rate", {
  id: id(),
  userId: userId(),
  base: currencyEnum("base").notNull(),
  quote: currencyEnum("quote").notNull(),
  // rate scaled by FX_SCALE = 1e6. 1 USD = 5.43 BRL → base USD, quote BRL, rate 5_430_000
  rate: bigint("rate", { mode: "number" }).notNull(),
  source: text("source").notNull().default("manual"),
  asOf: timestamp("as_of").defaultNow().notNull(),
}, (t) => [unique("exchange_rate_user_pair").on(t.userId, t.base, t.quote)]);
```

> Store one row per ordered pair the user maintains (at least `USD→BRL`). Derive the
> inverse in code, or let the user set both. Seed a sensible default on first use.

## 5.4 Categories

```ts
// packages/db/src/schema/categories.ts
import { boolean, pgTable, text, index } from "drizzle-orm/pg-core";
import { id, userId, timestamps } from "./_shared";
import { categoryKindEnum } from "./enums";

export const category = pgTable("category", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  kind: categoryKindEnum("kind").notNull().default("expense"),
  color: text("color"),
  icon: text("icon"),
  isSystem: boolean("is_system").notNull().default(false),
  isCreditCard: boolean("is_credit_card").notNull().default(false), // classification only (tag card-statement bills)
  ...timestamps,
}, (t) => [index("category_user_idx").on(t.userId)]);
```

Seed defaults per new user: Housing, Utilities, **Credit Card** (`isCreditCard`), Loan,
Taxes, Health, Subscription, Transport, Other. Note: credit **capacity** (Total Credit) is
computed from `credit_card` entities (§4.3), not from this flag — the flag is only for
grouping/reporting card‑statement bills.

## 5.5 Bills

```ts
// packages/db/src/schema/bills.ts
import { bigint, boolean, date, integer, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { currencyEnum } from "./enums";
import { bankAccount } from "./bank-accounts";
import { creditCard } from "./credit-cards";
import { category } from "./categories";
import { recurringExpense } from "./recurring";
import { purchasePlan } from "./plans";

export const bill = pgTable("bill", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  amount: money("amount").notNull(),                   // > 0
  currency: currencyEnum("currency").notNull().default("BRL"),
  dueDate: date("due_date", { mode: "string" }).notNull(),  // 'YYYY-MM-DD'
  month: text("month").notNull(),                      // 'YYYY-MM', derived from dueDate on write
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  paidFromAccountId: text("paid_from_account_id").references(() => bankAccount.id, { onDelete: "set null" }),
  paidFxRate: bigint("paid_fx_rate", { mode: "number" }),   // rate used if cross-currency (scaled 1e6)
  sourceAccountId: text("source_account_id").references(() => bankAccount.id, { onDelete: "set null" }),
  creditCardId: text("credit_card_id").references(() => creditCard.id, { onDelete: "set null" }), // card charge if set
  categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
  recurringExpenseId: text("recurring_expense_id").references(() => recurringExpense.id, { onDelete: "set null" }),
  purchasePlanId: text("purchase_plan_id").references(() => purchasePlan.id, { onDelete: "set null" }),
  installmentNumber: integer("installment_number"),
  installmentTotal: integer("installment_total"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  index("bill_user_idx").on(t.userId),
  index("bill_month_idx").on(t.userId, t.month),
  index("bill_due_idx").on(t.userId, t.dueDate),
  index("bill_recurring_month_idx").on(t.recurringExpenseId, t.month), // idempotency (§4.9)
]);
```

> Store both `dueDate` and a denormalized `month` (`'YYYY-MM'`) for fast, index‑friendly
> monthly roll‑ups (doc 04 §4.4). Compute `month` from `dueDate` on every write.

## 5.6 Recurring expenses (bills + subscriptions)

```ts
// packages/db/src/schema/recurring.ts
import { boolean, date, integer, pgTable, text, index } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { creditCard } from "./credit-cards";
import { category } from "./categories";
import { currencyEnum, recurringKindEnum, frequencyEnum, endModeEnum } from "./enums";

export const recurringExpense = pgTable("recurring_expense", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  defaultAmount: money("default_amount").notNull(),
  currency: currencyEnum("currency").notNull().default("BRL"),
  kind: recurringKindEnum("kind").notNull().default("bill"),
  categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
  sourceAccountId: text("source_account_id").references(() => bankAccount.id, { onDelete: "set null" }),
  creditCardId: text("credit_card_id").references(() => creditCard.id, { onDelete: "set null" }), // charged to a card if set
  frequency: frequencyEnum("frequency").notNull().default("monthly"),
  intervalMonths: integer("interval_months").notNull().default(1),
  renewDay: integer("renew_day").notNull(),            // 1..31 (clamped per month)
  endMode: endModeEnum("end_mode").notNull().default("infinite"),
  endDate: date("end_date", { mode: "string" }),
  installmentsTotal: integer("installments_total"),
  installmentsGenerated: integer("installments_generated").notNull().default(0),
  startDate: date("start_date", { mode: "string" }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [index("recurring_user_idx").on(t.userId)]);
```

## 5.7 Income + per‑month overrides

```ts
// packages/db/src/schema/income.ts
import { boolean, integer, pgTable, text, index, unique } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { currencyEnum } from "./enums";

export const income = pgTable("income", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  amount: money("amount").notNull(),
  currency: currencyEnum("currency").notNull().default("BRL"),
  dayOfMonth: integer("day_of_month"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [index("income_user_idx").on(t.userId)]);

export const incomeOverride = pgTable("income_override", {
  id: id(),
  userId: userId(),
  month: text("month").notNull(),                      // 'YYYY-MM'
  amount: money("amount").notNull(),
  ...timestamps,
}, (t) => [unique("income_override_user_month").on(t.userId, t.month)]);
```

## 5.8 Purchase plans

```ts
// packages/db/src/schema/plans.ts
import { date, integer, pgTable, text, index } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { currencyEnum, planModeEnum, planStatusEnum } from "./enums";

export const purchasePlan = pgTable("purchase_plan", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  totalAmount: money("total_amount").notNull(),
  currency: currencyEnum("currency").notNull().default("BRL"),
  mode: planModeEnum("mode").notNull().default("lump_sum"),
  installments: integer("installments"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  sourceAccountId: text("source_account_id").references(() => bankAccount.id, { onDelete: "set null" }),
  status: planStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("plan_user_idx").on(t.userId)]);
```

## 5.9 Activity log + user settings

```ts
// packages/db/src/schema/activity.ts
import { jsonb, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { id, userId, money } from "./_shared";
import { bankAccount } from "./bank-accounts";
import { bill } from "./bills";
import { activityTypeEnum } from "./enums";

export const activityLog = pgTable("activity_log", {
  id: id(),
  userId: userId(),
  type: activityTypeEnum("type").notNull(),
  bankAccountId: text("bank_account_id").references(() => bankAccount.id, { onDelete: "set null" }),
  billId: text("bill_id").references(() => bill.id, { onDelete: "set null" }),
  amount: money("amount"),                 // signed delta, nullable
  balanceAfter: money("balance_after"),
  meta: jsonb("meta"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (t) => [index("activity_user_idx").on(t.userId, t.occurredAt)]);
```

```ts
// packages/db/src/schema/settings.ts
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { id, userId, money, timestamps } from "./_shared";
import { currencyEnum } from "./enums";

export const userSettings = pgTable("user_settings", {
  id: id(),
  userId: userId(),                          // one row per user
  baseCurrency: currencyEnum("base_currency").notNull().default("BRL"),
  displayCurrency: currencyEnum("display_currency").notNull().default("BRL"), // view toggle
  projectionHorizonMonths: integer("projection_horizon_months").notNull().default(10),
  defaultAdditionalSpend: money("default_additional_spend").notNull().default(0),
  weekStartsOn: integer("week_starts_on").notNull().default(1), // Monday
  locale: text("locale").notNull().default("pt-BR"),
  theme: text("theme").notNull().default("dark"),
  ...timestamps,
});
```

## 5.10 Barrel export

```ts
// packages/db/src/schema/index.ts
export * from "./auth";
export * from "./enums";
export * from "./bank-accounts";
export * from "./credit-cards";
export * from "./exchange-rates";
export * from "./categories";
export * from "./recurring";
export * from "./bills";
export * from "./income";
export * from "./plans";
export * from "./activity";
export * from "./settings";
```

## 5.11 Indexing & query notes

- Monthly roll‑ups hit `bill(userId, month)` — covered by `bill_month_idx`.
- "Next bill" and overdue queries hit `bill(userId, dueDate)` filtered by `paid=false` —
  covered by `bill_due_idx`.
- Recurrence idempotency relies on `bill_recurring_month_idx` — enforce the
  `(recurringExpenseId, month)` uniqueness in application logic (partial‑unique is fine if
  you prefer a DB constraint: `WHERE recurring_expense_id IS NOT NULL`).
- **Credit usage** (doc 04 §4.3) scans `recurring_expense` and `bill` by `creditCardId`;
  add `index(userId, creditCardId)` on both if card views feel slow.
- All list endpoints filter by `userId` first (composite indexes lead with it).

## 5.12 Type inference

Export inferred types for the API/UI layers:

```ts
export type BankAccount = typeof bankAccount.$inferSelect;
export type NewBill = typeof bill.$inferInsert;
// …one pair per table. Consume via `@balance-point/db`.
```
