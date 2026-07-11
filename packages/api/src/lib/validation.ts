import { CURRENCY_CODES } from "@balance-point/money";
import { z } from "zod";

export const idSchema = z.string().min(1);
export const currencySchema = z.enum(CURRENCY_CODES);
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Expected 'YYYY-MM'");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected 'YYYY-MM-DD'");

/** Money over the wire is integer minor units. */
export const moneySchema = z.number().int();
export const positiveMoneySchema = moneySchema.positive();
export const nonNegativeMoneySchema = moneySchema.nonnegative();

export const dayOfMonthSchema = z.number().int().min(1).max(31);
