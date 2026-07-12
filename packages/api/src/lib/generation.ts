import type { Bill, RecurringExpense } from "@balance-point/db/schema/index";
import { bill, recurringExpense } from "@balance-point/db/schema/index";
import { eq } from "drizzle-orm";

import type { Tx } from "./db-types";
import { type Month, currentMonth } from "./month";
import { type Occurrence, enumerateOccurrences } from "./recurrence";

/**
 * Which months a template should have bills for, honoring the horizon. Card
 * templates (subscriptions and recurring card charges) materialize only the
 * current month — a card is only "charged" when the month arrives, so open
 * charges never eat the limit months ahead (§4.3 rework).
 */
export function occurrencesForTemplate(
  template: RecurringExpense,
  throughMonth: Month,
): Occurrence[] {
  const thisMonth = currentMonth();
  if (!template.creditCardId) return enumerateOccurrences(template, throughMonth);
  return enumerateOccurrences(template, thisMonth).filter((o) => o.month === thisMonth);
}

/**
 * Idempotent generation (doc 04 §4.9): fills only the months that don't have a
 * bill for `(recurringExpenseId, month)` yet. Card templates generate card
 * charges (bills carrying `creditCardId`) that settle via the card's fatura.
 */
export async function generateForTemplate(
  tx: Tx,
  template: RecurringExpense,
  throughMonth: Month,
): Promise<Bill[]> {
  if (!template.active) return [];

  const occurrences = occurrencesForTemplate(template, throughMonth);
  if (occurrences.length === 0) return [];

  const existing = await tx
    .select({ month: bill.month })
    .from(bill)
    .where(eq(bill.recurringExpenseId, template.id));
  const existingMonths = new Set(existing.map((r) => r.month));

  const missing = occurrences.filter((o) => !existingMonths.has(o.month));
  if (missing.length === 0) return [];

  const created = await tx
    .insert(bill)
    .values(
      missing.map((o) => ({
        userId: template.userId,
        name: template.name,
        amount: template.defaultAmount,
        currency: template.currency,
        dueDate: o.dueDate,
        month: o.month,
        paid: false,
        sourceAccountId: template.sourceAccountId,
        creditCardId: template.creditCardId,
        categoryId: template.categoryId,
        recurringExpenseId: template.id,
        installmentNumber: o.installmentNumber,
        installmentTotal:
          template.endMode === "installments" ? template.installmentsTotal : null,
      })),
    )
    .returning();

  if (template.endMode === "installments") {
    await tx
      .update(recurringExpense)
      .set({ installmentsGenerated: existingMonths.size + created.length })
      .where(eq(recurringExpense.id, template.id));
  }
  return created;
}
