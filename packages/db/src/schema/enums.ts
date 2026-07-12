import { pgEnum } from "drizzle-orm/pg-core";

export const currencyEnum = pgEnum("currency", ["BRL", "USD"]);
export const categoryKindEnum = pgEnum("category_kind", ["expense"]);
export const recurringKindEnum = pgEnum("recurring_kind", ["bill", "subscription"]);
export const frequencyEnum = pgEnum("frequency", ["monthly", "every_n_months", "manual"]);
export const endModeEnum = pgEnum("end_mode", ["infinite", "until_date", "installments"]);
export const compoundingEnum = pgEnum("compounding", ["monthly"]);
export const ratePeriodEnum = pgEnum("rate_period", ["annual", "monthly"]);
export const planModeEnum = pgEnum("plan_mode", ["lump_sum", "installments"]);
export const planStatusEnum = pgEnum("plan_status", ["draft", "committed"]);
export const activityTypeEnum = pgEnum("activity_type", [
  "bill_paid",
  "bill_unpaid",
  "bill_wont_pay",
  "bill_wont_pay_undone",
  "bill_deleted",
  "balance_edited",
  "yield_accrued",
  "transfer",
  "plan_committed",
]);
