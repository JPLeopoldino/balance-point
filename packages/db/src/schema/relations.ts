import { relations } from "drizzle-orm";

import { activityLog } from "./activity";
import { bankAccount, yieldConfig } from "./bank-accounts";
import { bill } from "./bills";
import { category } from "./categories";
import { creditCard } from "./credit-cards";
import { purchasePlan } from "./plans";
import { recurringExpense } from "./recurring";

export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  yield: one(yieldConfig, {
    fields: [bankAccount.id],
    references: [yieldConfig.bankAccountId],
  }),
  cards: many(creditCard),
}));

export const yieldConfigRelations = relations(yieldConfig, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [yieldConfig.bankAccountId],
    references: [bankAccount.id],
  }),
}));

export const creditCardRelations = relations(creditCard, ({ one, many }) => ({
  bankAccount: one(bankAccount, {
    fields: [creditCard.bankAccountId],
    references: [bankAccount.id],
  }),
  recurringExpenses: many(recurringExpense),
  bills: many(bill),
}));

export const billRelations = relations(bill, ({ one }) => ({
  category: one(category, {
    fields: [bill.categoryId],
    references: [category.id],
  }),
  sourceAccount: one(bankAccount, {
    fields: [bill.sourceAccountId],
    references: [bankAccount.id],
  }),
  paidFromAccount: one(bankAccount, {
    fields: [bill.paidFromAccountId],
    references: [bankAccount.id],
  }),
  creditCard: one(creditCard, {
    fields: [bill.creditCardId],
    references: [creditCard.id],
  }),
  recurringExpense: one(recurringExpense, {
    fields: [bill.recurringExpenseId],
    references: [recurringExpense.id],
  }),
  purchasePlan: one(purchasePlan, {
    fields: [bill.purchasePlanId],
    references: [purchasePlan.id],
  }),
}));

export const recurringExpenseRelations = relations(recurringExpense, ({ one, many }) => ({
  category: one(category, {
    fields: [recurringExpense.categoryId],
    references: [category.id],
  }),
  sourceAccount: one(bankAccount, {
    fields: [recurringExpense.sourceAccountId],
    references: [bankAccount.id],
  }),
  creditCard: one(creditCard, {
    fields: [recurringExpense.creditCardId],
    references: [creditCard.id],
  }),
  bills: many(bill),
}));

export const purchasePlanRelations = relations(purchasePlan, ({ one, many }) => ({
  sourceAccount: one(bankAccount, {
    fields: [purchasePlan.sourceAccountId],
    references: [bankAccount.id],
  }),
  bills: many(bill),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [activityLog.bankAccountId],
    references: [bankAccount.id],
  }),
  bill: one(bill, {
    fields: [activityLog.billId],
    references: [bill.id],
  }),
}));
