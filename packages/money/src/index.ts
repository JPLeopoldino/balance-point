/**
 * @balance-point/money — integer minor-unit money + currency/FX helpers.
 *
 * All money in the app is an integer number of minor units (centavos/cents)
 * in a specific currency. Floats are never used for money math; rounding is
 * half away from zero and only happens when a rate (FX, yield) is applied.
 */

export type Currency = "BRL" | "USD";

/** Integer minor units (centavos/cents). */
export type Money = number;

export const CURRENCY_CODES = ["BRL", "USD"] as const satisfies readonly Currency[];

export const CURRENCIES: Record<
  Currency,
  { decimals: number; symbol: string; locale: string; decimalSeparator: "," | "." }
> = {
  BRL: { decimals: 2, symbol: "R$", locale: "pt-BR", decimalSeparator: "," },
  USD: { decimals: 2, symbol: "$", locale: "en-US", decimalSeparator: "." },
};

/** Exchange rates are integers scaled by 1e6 (1 USD = 5.43 BRL → 5_430_000). */
export const FX_SCALE = 1_000_000;

export type FxRatePair = `${Currency}_${Currency}`;
export type FxRates = Partial<Record<FxRatePair, number>>;

export class MissingFxRateError extends Error {
  constructor(
    public readonly from: Currency,
    public readonly to: Currency,
  ) {
    super(`Missing exchange rate ${from}→${to}`);
    this.name = "MissingFxRateError";
  }
}

function assertMoney(value: number, label = "money value"): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected ${label} to be a safe integer of minor units, got ${value}`);
  }
}

/** JS Math.round rounds -0.5 → 0; money rounding is half AWAY from zero. */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export interface FormatMoneyOptions {
  /** Force an explicit +/− sign on non-zero values. */
  sign?: boolean;
  /** Compact notation for tight spots (chart axes): "R$ 1,9 mil" / "$1.9K". */
  compact?: boolean;
}

/**
 * Format minor units in the currency's own locale.
 * `formatMoney(190000, "BRL")` → `"R$ 1.900,00"`, `formatMoney(190000, "USD")` → `"$1,900.00"`.
 */
export function formatMoney(
  units: Money,
  currency: Currency,
  { sign = false, compact = false }: FormatMoneyOptions = {},
): string {
  assertMoney(units);
  const { decimals, locale } = CURRENCIES[currency];
  const value = units / 10 ** decimals;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? 1 : decimals,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(value);
  // Intl uses non-breaking/narrow spaces; normalize so "R$ 1.900,00" is a plain space.
  return formatted.replace(/[  ]/g, " ");
}

/**
 * Parse a user-typed decimal string into minor units.
 * Accepts "," or "." as the decimal separator; when both appear the rightmost
 * wins and the other is treated as grouping ("1.900,50" → 190050, "1,900.50" → 190050).
 * Extra fraction digits round half away from zero.
 */
export function toMinorUnits(input: string, currency: Currency): Money {
  const { decimals } = CURRENCIES[currency];
  let s = input.trim().replace(/\s/g, "").replace(/(R\$|US\$|\$)/g, "");
  let negative = false;
  if (s.startsWith("-") || s.startsWith("−") || s.startsWith("(")) {
    negative = true;
    s = s.replace(/^[-−(]/, "").replace(/\)$/, "");
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!s) throw new RangeError(`Invalid money string: "${input}"`);

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep: string | null = null;
  if (lastComma !== -1 && lastDot !== -1) decimalSep = lastComma > lastDot ? "," : ".";
  else if (lastComma !== -1) decimalSep = ",";
  else if (lastDot !== -1) decimalSep = ".";

  let intPart = s;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "") || "0";
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new RangeError(`Invalid money string: "${input}"`);
  }

  const fracDigits = fracPart.padEnd(decimals, "0");
  let units = BigInt(intPart) * BigInt(10 ** decimals) + BigInt(fracDigits.slice(0, decimals) || "0");
  const rest = fracDigits.slice(decimals);
  if (rest && Number(rest.charAt(0)) >= 5) units += BigInt(1);

  const result = Number(units);
  assertMoney(result, `parsed value of "${input}"`);
  return negative ? -result : result;
}

/** Minor units → plain decimal string ("190050" → "1900.50"). Inverse of `toMinorUnits`. */
export function fromMinorUnits(units: Money, currency: Currency): string {
  assertMoney(units);
  const { decimals } = CURRENCIES[currency];
  const negative = units < 0;
  const abs = Math.abs(units).toString().padStart(decimals + 1, "0");
  const intPart = abs.slice(0, abs.length - decimals);
  const frac = abs.slice(abs.length - decimals);
  return `${negative ? "-" : ""}${intPart}${decimals > 0 ? `.${frac}` : ""}`;
}

/**
 * Minor units → editable text using the currency's own decimal separator
 * ("190050" → "1900,50" for BRL, "1900.50" for USD). No grouping — this is the
 * money-input representation, not display formatting (that's `formatMoney`).
 */
export function toInputString(units: Money, currency: Currency): string {
  return fromMinorUnits(units, currency).replace(".", CURRENCIES[currency].decimalSeparator);
}

/** Guarded integer sum. Same-currency only — never sum raw units across currencies. */
export function sumMoney(...units: Money[]): Money {
  return units.reduce<Money>((total, value) => {
    assertMoney(value);
    return total + value;
  }, 0);
}

/**
 * Resolve the scaled rate for a pair, deriving the inverse when only the
 * opposite direction is stored: rate(B→A) = FX_SCALE² / rate(A→B).
 */
export function getRate(from: Currency, to: Currency, rates: FxRates): number {
  if (from === to) return FX_SCALE;
  const direct = rates[`${from}_${to}`];
  if (direct !== undefined && direct > 0) return direct;
  const inverse = rates[`${to}_${from}`];
  if (inverse !== undefined && inverse > 0) {
    return roundHalfAwayFromZero((FX_SCALE * FX_SCALE) / inverse);
  }
  throw new MissingFxRateError(from, to);
}

/** Apply an already-resolved scaled rate (e.g. a stored `paidFxRate`). */
export function convertWithRate(units: Money, rate: number): Money {
  assertMoney(units);
  return roundHalfAwayFromZero((units * rate) / FX_SCALE);
}

/** Convert between currencies via stored rates. Same currency is a no-op. */
export function convert(units: Money, from: Currency, to: Currency, rates: FxRates): Money {
  if (from === to) {
    assertMoney(units);
    return units;
  }
  return convertWithRate(units, getRate(from, to, rates));
}

export type RatePeriod = "annual" | "monthly";

/**
 * One month of investment yield for a rate in basis points, monthly
 * compounding. `period` says what the rate is quoted per:
 * annual 13.75%/yr → 1375 bps, monthly rate = bps / 10_000 / 12;
 * monthly 1%/mo → 100 bps, monthly rate = bps / 10_000 (CDI-style quotes).
 */
export function monthlyYieldAccrual(
  investmentBalance: Money,
  rateBps: number,
  period: RatePeriod = "annual",
): Money {
  assertMoney(investmentBalance);
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new RangeError(`rateBps must be a non-negative integer, got ${rateBps}`);
  }
  const divisor = period === "monthly" ? 10_000 : 10_000 * 12;
  return roundHalfAwayFromZero((investmentBalance * rateBps) / divisor);
}
