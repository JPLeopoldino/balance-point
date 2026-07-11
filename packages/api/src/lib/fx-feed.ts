import { exchangeRate } from "@balance-point/db/schema/index";
import { FX_SCALE, roundHalfAwayFromZero } from "@balance-point/money";
import { and, eq } from "drizzle-orm";

import type { DbLike } from "./db-types";

export interface FxFeedResult {
  /** Scaled by FX_SCALE (1 USD = 5.43 BRL → 5_430_000). */
  rate: number;
  source: string;
}

const FEED_TIMEOUT_MS = 5_000;
/** A day-old quote is fine for a personal dashboard; refresh past this. */
export const FX_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function toScaled(value: number): number {
  const scaled = roundHalfAwayFromZero(value * FX_SCALE);
  // Sanity bounds: BRL per USD has never been near these extremes.
  if (!Number.isSafeInteger(scaled) || scaled <= FX_SCALE / 100 || scaled >= FX_SCALE * 1000) {
    throw new Error(`Implausible USD→BRL rate: ${value}`);
  }
  return scaled;
}

/** Brazilian quote service — near-real-time bid, no API key. */
async function fetchAwesomeApi(): Promise<FxFeedResult> {
  const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`awesomeapi ${res.status}`);
  const body = (await res.json()) as { USDBRL?: { bid?: string } };
  const bid = Number(body.USDBRL?.bid);
  if (!Number.isFinite(bid)) throw new Error("awesomeapi: missing bid");
  return { rate: toScaled(bid), source: "economia.awesomeapi.com.br" };
}

/** ExchangeRate-API open endpoint — daily reference rates, no API key. */
async function fetchErApi(): Promise<FxFeedResult> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`er-api ${res.status}`);
  const body = (await res.json()) as { result?: string; rates?: { BRL?: number } };
  const rate = body.rates?.BRL;
  if (body.result !== "success" || !Number.isFinite(rate)) throw new Error("er-api: missing BRL");
  return { rate: toScaled(rate!), source: "open.er-api.com" };
}

/** Try the providers in order; null when every one of them fails. */
export async function fetchUsdBrlRate(): Promise<FxFeedResult | null> {
  for (const provider of [fetchAwesomeApi, fetchErApi]) {
    try {
      return await provider();
    } catch {
      // fall through to the next provider
    }
  }
  return null;
}

/**
 * Auto-refresh (doc item: "conversão deve ser automática"): fetch and upsert
 * the user's USD→BRL rate when it's missing or older than a day. Failures are
 * silent — the stored rate keeps working until a fetch succeeds.
 */
export async function refreshUsdBrlIfStale(db: DbLike, userId: string): Promise<void> {
  const existing = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.userId, userId),
      eq(exchangeRate.base, "USD"),
      eq(exchangeRate.quote, "BRL"),
    ),
  });
  if (existing && Date.now() - existing.asOf.getTime() < FX_STALE_AFTER_MS) return;

  const fetched = await fetchUsdBrlRate();
  if (!fetched) return;

  await db
    .insert(exchangeRate)
    .values({ userId, base: "USD", quote: "BRL", rate: fetched.rate, source: fetched.source, asOf: new Date() })
    .onConflictDoUpdate({
      target: [exchangeRate.userId, exchangeRate.base, exchangeRate.quote],
      set: { rate: fetched.rate, source: fetched.source, asOf: new Date() },
    });
}
