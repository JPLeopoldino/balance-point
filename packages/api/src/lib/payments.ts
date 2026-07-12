import { bankAccount, bill } from "@balance-point/db/schema/index";
import type { BankAccount, Bill } from "@balance-point/db/schema/index";
import {
  type FxRates,
  MissingFxRateError,
  type Money,
  convertWithRate,
  formatMoney,
  getRate,
} from "@balance-point/money";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { logActivity } from "./activity";
import type { Tx } from "./db-types";
import type { Locale } from "./locale";
import { messagesFor } from "./messages";

async function loadOwnedBill(tx: Tx, userId: string, billId: string): Promise<Bill> {
  const row = await tx.query.bill.findFirst({
    where: and(eq(bill.id, billId), eq(bill.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
  return row;
}

async function loadOwnedAccount(tx: Tx, userId: string, accountId: string): Promise<BankAccount> {
  const row = await tx.query.bankAccount.findFirst({
    where: and(eq(bankAccount.id, accountId), eq(bankAccount.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found" });
  return row;
}

export interface PayResult {
  bill: Bill;
  account: BankAccount | null;
  warning?: string;
  /** Debit applied, in the account's currency (0 for the idempotent no-op). */
  debit: Money;
  skipped: boolean;
}

/**
 * Pay a single bill inside an open transaction (doc 04 §4.5): flips `paid`,
 * deducts the (converted) amount from the source account's checking balance,
 * stores the FX rate used, and appends an activity row. Paying an already-paid
 * bill is a no-op; negative balances are allowed with a soft warning.
 */
export async function payBillTx(
  tx: Tx,
  args: {
    userId: string;
    billId: string;
    fromAccountId?: string | null;
    rates: FxRates;
    locale?: Locale;
  },
): Promise<PayResult> {
  const { userId, rates } = args;
  const msg = messagesFor(args.locale ?? "en");
  const row = await loadOwnedBill(tx, userId, args.billId);

  if (row.creditCardId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: msg.cardChargeNotPayable });
  }
  if (row.paid) {
    const account = row.paidFromAccountId
      ? await loadOwnedAccount(tx, userId, row.paidFromAccountId).catch(() => null)
      : null;
    return { bill: row, account, debit: 0, skipped: true };
  }
  if (row.amount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Bill amount must be greater than zero" });
  }

  const accountId = args.fromAccountId ?? row.sourceAccountId;
  if (!accountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: msg.chooseAccount });
  }
  const account = await loadOwnedAccount(tx, userId, accountId);

  let debit = row.amount;
  let fxRate: number | null = null;
  if (row.currency !== account.currency) {
    try {
      fxRate = getRate(row.currency, account.currency, rates);
    } catch (error) {
      if (error instanceof MissingFxRateError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: msg.setRateBeforePaying(`${error.from}→${error.to}`),
        });
      }
      throw error;
    }
    debit = convertWithRate(row.amount, fxRate);
  }

  const newBalance = account.checkingBalance - debit;
  const paidAt = new Date();

  const [updatedBill] = await tx
    .update(bill)
    .set({ paid: true, wontPay: false, paidAt, paidFromAccountId: account.id, paidFxRate: fxRate })
    .where(and(eq(bill.id, row.id), eq(bill.userId, userId)))
    .returning();
  const [updatedAccount] = await tx
    .update(bankAccount)
    .set({ checkingBalance: newBalance })
    .where(and(eq(bankAccount.id, account.id), eq(bankAccount.userId, userId)))
    .returning();

  await logActivity(tx, {
    userId,
    type: "bill_paid",
    bankAccountId: account.id,
    billId: row.id,
    amount: -debit,
    balanceAfter: newBalance,
    meta: fxRate ? { billCurrency: row.currency, fxRate } : null,
  });

  const warning =
    newBalance < 0
      ? msg.negativeBalance(account.name, formatMoney(newBalance, account.currency))
      : undefined;

  return { bill: updatedBill!, account: updatedAccount!, warning, debit, skipped: false };
}

export interface UnpayResult {
  bill: Bill;
  account: BankAccount | null;
  /** Credit returned, in the credited account's currency. */
  credit: Money;
  skipped: boolean;
}

/**
 * Reverse a payment (doc 04 §4.6) using the exact rate it was paid at. If the
 * original account is gone, the refund lands on the bill's source account.
 */
export async function unpayBillTx(
  tx: Tx,
  args: { userId: string; billId: string; locale?: Locale },
): Promise<UnpayResult> {
  const { userId } = args;
  const msg = messagesFor(args.locale ?? "en");
  const row = await loadOwnedBill(tx, userId, args.billId);
  if (!row.paid) return { bill: row, account: null, credit: 0, skipped: true };

  const credit = row.paidFxRate ? convertWithRate(row.amount, row.paidFxRate) : row.amount;

  let account: BankAccount | null = null;
  let redirected = false;
  if (row.paidFromAccountId) {
    account = await loadOwnedAccount(tx, userId, row.paidFromAccountId).catch(() => null);
  }
  if (!account && row.sourceAccountId) {
    account = await loadOwnedAccount(tx, userId, row.sourceAccountId).catch(() => null);
    redirected = account !== null;
  }
  if (!account) {
    throw new TRPCError({ code: "BAD_REQUEST", message: msg.refundAccountGone });
  }

  const newBalance = account.checkingBalance + credit;

  const [updatedBill] = await tx
    .update(bill)
    .set({ paid: false, paidAt: null, paidFromAccountId: null, paidFxRate: null })
    .where(and(eq(bill.id, row.id), eq(bill.userId, userId)))
    .returning();
  const [updatedAccount] = await tx
    .update(bankAccount)
    .set({ checkingBalance: newBalance })
    .where(and(eq(bankAccount.id, account.id), eq(bankAccount.userId, userId)))
    .returning();

  await logActivity(tx, {
    userId,
    type: "bill_unpaid",
    bankAccountId: account.id,
    billId: row.id,
    amount: credit,
    balanceAfter: newBalance,
    meta: redirected ? { redirectedToSourceAccount: true } : null,
  });

  return { bill: updatedBill!, account: updatedAccount!, credit, skipped: false };
}
