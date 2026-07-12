import { db } from "@balance-point/db";
import type { Bill } from "@balance-point/db/schema/index";
import { bill, category, creditCard } from "@balance-point/db/schema/index";
import type { FxRates, Money } from "@balance-point/money";
import { sumMoney } from "@balance-point/money";
import { and, asc, eq, isNotNull, isNull, lt } from "drizzle-orm";

import type { DbLike, Tx } from "./db-types";
import { createSafeConverter, loadFxRates } from "./fx";
import type { Locale } from "./locale";
import { messagesFor } from "./messages";
import { type ISODate, type Month, addMonths, currentMonth, dateInMonth } from "./month";

/**
 * Card statements ("faturas") — doc 04 §4.3 reworked: one auto-generated bill
 * per card+month gathers the card's open charges; paying it settles them and
 * frees the card's limit.
 */

export interface StatementWindow {
  dueDate: ISODate;
  /** Charges with dueDate <= cutoff belong to this statement. */
  cutoff: ISODate;
}

/** Due date + charge cutoff for a card's statement in `month`. */
export function statementWindow(
  card: { dueDay: number | null; closingDay: number | null },
  month: Month,
): StatementWindow {
  const dueDate = dateInMonth(month, card.dueDay ?? 1);
  let cutoff = dueDate;
  if (card.closingDay != null) {
    const sameMonth = dateInMonth(month, card.closingDay);
    // Closing after the due day means the statement closed the month before.
    cutoff = sameMonth <= dueDate ? sameMonth : dateInMonth(addMonths(month, -1), card.closingDay);
  }
  return { dueDate, cutoff };
}

/**
 * The charges a statement covers: the card's unpaid, unsettled charges due up
 * to its cutoff — minus anything an OLDER open statement of the same card
 * already covers, so two open statements never double-claim a charge.
 */
export async function coveredChargesTx(
  tx: DbLike,
  userId: string,
  statement: Pick<Bill, "statementCardId" | "month">,
): Promise<Bill[]> {
  const cardId = statement.statementCardId;
  if (!cardId) return [];
  const card = await tx.query.creditCard.findFirst({
    where: and(eq(creditCard.id, cardId), eq(creditCard.userId, userId)),
  });
  if (!card) return [];

  const { cutoff } = statementWindow(card, statement.month);
  const olderOpen = await tx.query.bill.findMany({
    where: and(
      eq(bill.userId, userId),
      eq(bill.statementCardId, cardId),
      eq(bill.paid, false),
      lt(bill.month, statement.month),
    ),
    columns: { month: true },
  });
  const floor = olderOpen
    .map((s) => statementWindow(card, s.month).cutoff)
    .sort()
    .at(-1);

  const charges = await tx.query.bill.findMany({
    where: and(
      eq(bill.userId, userId),
      eq(bill.creditCardId, cardId),
      eq(bill.paid, false),
      isNull(bill.settledByBillId),
    ),
    orderBy: [asc(bill.dueDate), asc(bill.createdAt)],
  });
  return charges.filter((c) => c.dueDate <= cutoff && (!floor || c.dueDate > floor));
}

/** Sum of charges in the statement's (card's) currency. */
export function chargesTotal(
  charges: Pick<Bill, "amount" | "currency">[],
  rates: FxRates,
  currency: Bill["currency"],
): Money {
  const { conv } = createSafeConverter(rates, currency);
  return sumMoney(...charges.map((c) => conv(c.amount, c.currency)));
}

/** Mark the statement's covered charges settled (paid via this fatura). */
export async function settleStatementChargesTx(
  tx: Tx,
  userId: string,
  statement: Bill,
  paidAt: Date,
): Promise<Bill[]> {
  const covered = await coveredChargesTx(tx, userId, statement);
  for (const charge of covered) {
    await tx
      .update(bill)
      .set({ paid: true, wontPay: false, paidAt, paidWithoutAccount: true, settledByBillId: statement.id })
      .where(and(eq(bill.id, charge.id), eq(bill.userId, userId)));
  }
  return covered;
}

/** Reverse a statement payment: its settled charges reopen on the card. */
export async function unsettleStatementChargesTx(tx: Tx, userId: string, statementId: string) {
  await tx
    .update(bill)
    .set({ paid: false, paidAt: null, paidWithoutAccount: false, settledByBillId: null })
    .where(and(eq(bill.userId, userId), eq(bill.settledByBillId, statementId)));
}

/**
 * Ensure/refresh statement bills, idempotently: creates the current month's
 * fatura for every active card with a due day that has open charges, keeps
 * unpaid fatura amounts in sync with their covered charges, and removes
 * unpaid faturas left with nothing to cover.
 */
export async function refreshCardStatements(userId: string, locale: Locale = "en") {
  const cards = await db.query.creditCard.findMany({
    where: and(
      eq(creditCard.userId, userId),
      eq(creditCard.archived, false),
      isNotNull(creditCard.dueDay),
    ),
  });
  if (cards.length === 0) return;

  const [rates, openCharges, statements] = await Promise.all([
    loadFxRates(db, userId),
    db.query.bill.findMany({
      where: and(
        eq(bill.userId, userId),
        eq(bill.paid, false),
        isNotNull(bill.creditCardId),
        isNull(bill.settledByBillId),
      ),
    }),
    db.query.bill.findMany({
      where: and(eq(bill.userId, userId), isNotNull(bill.statementCardId)),
      orderBy: [asc(bill.month)],
    }),
  ]);

  const month = currentMonth();
  const msg = messagesFor(locale);

  for (const card of cards) {
    const charges = openCharges
      .filter((c) => c.creditCardId === card.id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const cardStatements = statements.filter((s) => s.statementCardId === card.id);

    // Oldest-first: each OPEN statement claims the still-uncovered charges up
    // to its own cutoff, mirroring `coveredChargesTx`'s assignment. Paid
    // statements claim nothing — late charges roll into the next fatura.
    let floor: ISODate | "" = "";
    for (const statement of cardStatements) {
      if (statement.paid) continue;
      const { cutoff } = statementWindow(card, statement.month);
      const covered = charges.filter((c) => c.dueDate <= cutoff && c.dueDate > floor);
      floor = cutoff > floor ? cutoff : floor;
      if (covered.length === 0 && !statement.wontPay) {
        await db.delete(bill).where(and(eq(bill.id, statement.id), eq(bill.userId, userId)));
        continue;
      }
      const amount = chargesTotal(covered, rates, card.currency);
      if (amount > 0 && amount !== statement.amount) {
        await db
          .update(bill)
          .set({ amount })
          .where(and(eq(bill.id, statement.id), eq(bill.userId, userId)));
      }
    }

    // Current month's fatura, when it doesn't exist yet and there is something to cover.
    if (!cardStatements.some((s) => s.month === month)) {
      const { cutoff, dueDate } = statementWindow(card, month);
      const covered = charges.filter((c) => c.dueDate <= cutoff && c.dueDate > floor);
      if (covered.length === 0) continue;
      const amount = chargesTotal(covered, rates, card.currency);
      if (amount <= 0) continue;
      const statementCategory = await db.query.category.findFirst({
        where: and(eq(category.userId, userId), eq(category.isCreditCard, true)),
      });
      await db.insert(bill).values({
        userId,
        name: msg.statementBillName(card.name),
        amount,
        currency: card.currency,
        dueDate,
        month,
        paid: false,
        sourceAccountId: card.bankAccountId,
        categoryId: statementCategory?.id ?? null,
        statementCardId: card.id,
      });
    }
  }
}
