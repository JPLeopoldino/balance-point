import { db as defaultDb } from "@balance-point/db";
import { category, exchangeRate, userSettings } from "@balance-point/db/schema/index";
import { and, eq } from "drizzle-orm";

import type { Locale } from "./locale";

type Db = typeof defaultDb;

const DEFAULT_CATEGORIES: { name: string; color: string; isCreditCard?: boolean }[] = [
  { name: "Housing", color: "var(--chart-4)" },
  { name: "Utilities", color: "var(--chart-2)" },
  { name: "Credit Card", color: "var(--chart-1)", isCreditCard: true },
  { name: "Loan", color: "var(--chart-3)" },
  { name: "Taxes", color: "var(--chart-5)" },
  { name: "Health", color: "var(--chart-6)" },
  { name: "Subscription", color: "var(--chart-3)" },
  { name: "Transport", color: "var(--chart-5)" },
  { name: "Other", color: "var(--muted-foreground)" },
];

/** Default 1 USD = 5.43 BRL until the user sets their own (doc 05 §5.3a). */
const DEFAULT_USD_BRL_RATE = 5_430_000;

/**
 * Idempotently seed a new user: settings row, default categories, USD→BRL rate.
 * Safe to call on every settings/dashboard read (doc 07 §7.11).
 * `preferredLocale` (from Accept-Language) only applies on the very first
 * insert — after that the user's stored choice wins.
 */
export async function ensureUserDefaults(db: Db, userId: string, preferredLocale?: Locale | null) {
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) {
    await db
      .insert(userSettings)
      .values({ userId, ...(preferredLocale ? { locale: preferredLocale } : {}) })
      .onConflictDoNothing();
    settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    // The first dashboard load fires several seeding queries concurrently; the
    // (userId, name) unique makes racing inserts collapse into no-ops.
    await db
      .insert(category)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          userId,
          name: c.name,
          color: c.color,
          isSystem: true,
          isCreditCard: c.isCreditCard ?? false,
        })),
      )
      .onConflictDoNothing();

    const existingRate = await db
      .select({ id: exchangeRate.id })
      .from(exchangeRate)
      .where(
        and(eq(exchangeRate.userId, userId), eq(exchangeRate.base, "USD"), eq(exchangeRate.quote, "BRL")),
      )
      .limit(1);
    if (existingRate.length === 0) {
      await db
        .insert(exchangeRate)
        .values({ userId, base: "USD", quote: "BRL", rate: DEFAULT_USD_BRL_RATE, source: "default" })
        .onConflictDoNothing();
    }
  }

  if (!settings) throw new Error("Failed to create user settings");
  return settings;
}
