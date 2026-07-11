import { db as defaultDb } from "@balance-point/db";
import { exchangeRate } from "@balance-point/db/schema/index";
import {
  type Currency,
  type FxRates,
  MissingFxRateError,
  type Money,
  convert,
} from "@balance-point/money";
import { eq } from "drizzle-orm";

import type { Locale } from "./locale";
import { messagesFor } from "./messages";

type Db = typeof defaultDb;

export async function loadFxRates(db: Db, userId: string): Promise<FxRates> {
  const rows = await db.select().from(exchangeRate).where(eq(exchangeRate.userId, userId));
  const rates: FxRates = {};
  for (const row of rows) {
    rates[`${row.base}_${row.quote}`] = row.rate;
  }
  return rates;
}

/**
 * Conversion that never throws for aggregates: a missing pair contributes 0 to
 * the roll-up and surfaces as a soft warning instead (doc 04 §4.1a).
 */
export function createSafeConverter(rates: FxRates, to: Currency, locale: Locale = "en") {
  const missing = new Set<string>();
  const conv = (units: Money, from: Currency): Money => {
    try {
      return convert(units, from, to, rates);
    } catch (error) {
      if (error instanceof MissingFxRateError) {
        missing.add(`${error.from}→${error.to}`);
        return 0;
      }
      throw error;
    }
  };
  const warnings = () => [...missing].map((pair) => messagesFor(locale).missingFxRate(pair));
  return { conv, warnings };
}
