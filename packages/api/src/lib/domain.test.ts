/**
 * Golden tests for the pure domain functions, using the worked examples
 * reverse-engineered from the source spreadsheet (docs 02 & 04).
 */
import {
  convert,
  formatMoney,
  fromMinorUnits,
  monthlyYieldAccrual,
  sumMoney,
  toInputString,
  toMinorUnits,
} from "@balance-point/money";
import { describe, expect, it } from "vitest";

import { cardUsage, monthlyEquivalent } from "./credit";
import {
  addMonths,
  addMonthsToTimestamp,
  dateInMonth,
  monthDiff,
  wholeMonthsBetween,
} from "./month";
import { planOutflows } from "./plan";
import { buildProjection } from "./projection";
import { enumerateOccurrences } from "./recurrence";
import { monthRollup } from "./rollups";
import { yieldCatchUp } from "./yield";

const identity = (units: number) => units;

describe("money (doc 04 §4.1)", () => {
  it("formats BRL and USD per locale", () => {
    expect(formatMoney(190000, "BRL")).toBe("R$ 1.900,00");
    expect(formatMoney(190000, "USD")).toBe("$1,900.00");
    expect(formatMoney(-35000, "BRL")).toBe("-R$ 350,00");
    expect(formatMoney(35000, "BRL", { sign: true })).toBe("+R$ 350,00");
  });

  it("parses decimal strings in both separator styles", () => {
    expect(toMinorUnits("1900.00", "BRL")).toBe(190000);
    expect(toMinorUnits("1900,00", "BRL")).toBe(190000);
    expect(toMinorUnits("1.900,50", "BRL")).toBe(190050);
    expect(toMinorUnits("1,900.50", "USD")).toBe(190050);
    expect(toMinorUnits("-350", "BRL")).toBe(-35000);
    expect(toMinorUnits("0.615", "BRL")).toBe(62); // rounds half away from zero
  });

  it("round-trips through fromMinorUnits", () => {
    expect(fromMinorUnits(190050, "BRL")).toBe("1900.50");
    expect(fromMinorUnits(-5, "BRL")).toBe("-0.05");
    expect(toMinorUnits(fromMinorUnits(123456789, "USD"), "USD")).toBe(123456789);
  });

  it("toInputString uses the currency's decimal separator", () => {
    expect(toInputString(190050, "BRL")).toBe("1900,50");
    expect(toInputString(190050, "USD")).toBe("1900.50");
    expect(toInputString(-5, "BRL")).toBe("-0,05");
    expect(toMinorUnits(toInputString(123456, "BRL"), "BRL")).toBe(123456);
  });

  it("sums integers and rejects floats", () => {
    expect(sumMoney(100, 250, -50)).toBe(300);
    expect(() => sumMoney(100.5)).toThrow();
  });
});

describe("FX conversion (doc 04 §4.1a)", () => {
  const rates = { USD_BRL: 5_430_000 };

  it("converts using a stored rate (golden from doc 10 stage 0)", () => {
    expect(convert(100_00, "USD", "BRL", rates)).toBe(543_00);
  });

  it("derives the inverse when only one direction is stored", () => {
    expect(convert(543_00, "BRL", "USD", rates)).toBe(100_00);
  });

  it("is a no-op for same currency and throws when the pair is missing", () => {
    expect(convert(123, "BRL", "BRL", {})).toBe(123);
    expect(() => convert(100, "USD", "BRL", {})).toThrow("Missing exchange rate");
  });
});

describe("month roll-up (doc 04 §4.4)", () => {
  it("Month bills = remaining, not total (June sample: 17,340.28 − 5,327.83)", () => {
    const june = [
      { amount: 5_327_83, currency: "BRL" as const, paid: true, wontPay: false },
      { amount: 12_012_45, currency: "BRL" as const, paid: false, wontPay: false },
    ];
    const rollup = monthRollup(june, identity);
    expect(rollup.totalBills).toBe(17_340_28);
    expect(rollup.paidBills).toBe(5_327_83);
    expect(rollup.remainingBills).toBe(12_012_45);
  });

  it("a fully paid month shows 0 remaining", () => {
    const rollup = monthRollup(
      [{ amount: 1000, currency: "BRL", paid: true, wontPay: false }],
      identity,
    );
    expect(rollup.remainingBills).toBe(0);
  });

  it("won't-pay bills leave the payable math but are reported separately", () => {
    const rollup = monthRollup(
      [
        { amount: 1000, currency: "BRL" as const, paid: false, wontPay: false },
        { amount: 500, currency: "BRL" as const, paid: true, wontPay: false },
        { amount: 700, currency: "BRL" as const, paid: false, wontPay: true },
      ],
      identity,
    );
    expect(rollup.totalBills).toBe(1500);
    expect(rollup.paidBills).toBe(500);
    expect(rollup.remainingBills).toBe(1000);
    expect(rollup.wontPayBills).toBe(700);
  });
});

describe("projection (doc 02 §2.2-E, doc 04 §4.8)", () => {
  it("reproduces the spreadsheet's first two rows exactly", () => {
    // Seed = Free Total 2,785.75; Aug: income 20,000, bills 9,952.21, add 0
    // → 12,833.54. Sep: income 18,550, bills 7,816.35, add 5,000 → 18,567.19.
    const rows = buildProjection({
      seedFreeTotal: 2_785_75,
      months: ["2026-08", "2026-09"],
      incomeFor: (m) => (m === "2026-08" ? 20_000_00 : 18_550_00),
      billsFor: (m) => (m === "2026-08" ? 9_952_21 : 7_816_35),
      additionalFor: (m) => (m === "2026-08" ? 0 : 5_000_00),
    });
    expect(rows[0]!.projectedBalance).toBe(12_833_54);
    expect(rows[1]!.projectedBalance).toBe(18_567_19);
  });

  it("adds the yield term when provided", () => {
    const withYield = buildProjection({
      seedFreeTotal: 0,
      months: ["2026-08"],
      incomeFor: () => 0,
      billsFor: () => 0,
      additionalFor: () => 0,
      yieldFor: () => 137,
    });
    expect(withYield[0]!.projectedBalance).toBe(137);
  });
});

describe("recurrence (doc 04 §4.9)", () => {
  const base = {
    frequency: "monthly" as const,
    intervalMonths: 1,
    renewDay: 5,
    endMode: "infinite" as const,
    endDate: null,
    installmentsTotal: null,
    startDate: "2026-07-01",
  };

  it("monthly infinite generates one bill per month through the horizon", () => {
    const occ = enumerateOccurrences(base, "2026-10");
    expect(occ.map((o) => o.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(occ[0]!.dueDate).toBe("2026-07-05");
  });

  it("clamps renew day 31 to the month's length", () => {
    const occ = enumerateOccurrences({ ...base, renewDay: 31, startDate: "2026-01-01" }, "2026-02");
    expect(occ.map((o) => o.dueDate)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("every_n_months steps by the interval", () => {
    const occ = enumerateOccurrences(
      { ...base, frequency: "every_n_months", intervalMonths: 3 },
      "2027-01",
    );
    expect(occ.map((o) => o.month)).toEqual(["2026-07", "2026-10", "2027-01"]);
  });

  it("installments emits exactly N stamped occurrences regardless of horizon", () => {
    const occ = enumerateOccurrences(
      { ...base, endMode: "installments", installmentsTotal: 12 },
      "2026-08",
    );
    expect(occ).toHaveLength(12);
    expect(occ[0]!.installmentNumber).toBe(1);
    expect(occ[11]!.installmentNumber).toBe(12);
  });

  it("until_date stops after the end month; manual never generates", () => {
    const occ = enumerateOccurrences(
      { ...base, endMode: "until_date", endDate: "2026-09-15" },
      "2027-01",
    );
    expect(occ.map((o) => o.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(enumerateOccurrences({ ...base, frequency: "manual" }, "2027-01")).toEqual([]);
  });
});

describe("credit cards (doc 04 §4.3)", () => {
  it("monthlyEquivalent amortizes non-monthly cadences", () => {
    expect(monthlyEquivalent({ frequency: "monthly", intervalMonths: 1, defaultAmount: 2790 })).toBe(2790);
    expect(monthlyEquivalent({ frequency: "every_n_months", intervalMonths: 6, defaultAmount: 3490 })).toBe(582);
    expect(monthlyEquivalent({ frequency: "manual", intervalMonths: 1, defaultAmount: 9999 })).toBe(0);
  });

  it("used = open charges only; committed monthly stays a display metric", () => {
    // Card templates materialize monthly charge bills now, so the open charges
    // ARE the used credit — counting committedMonthly again would double it.
    const usage = cardUsage(
      12_000_00,
      [{ frequency: "monthly", intervalMonths: 1, defaultAmount: 8_800_00, currency: "BRL" }],
      [{ amount: 8_800_00, currency: "BRL" }],
      identity,
    );
    expect(usage.committedMonthly).toBe(8_800_00);
    expect(usage.used).toBe(8_800_00);
    expect(usage.available).toBe(3_200_00);

    const withOpen = cardUsage(
      12_000_00,
      [{ frequency: "monthly", intervalMonths: 1, defaultAmount: 8_800_00, currency: "BRL" }],
      [
        { amount: 8_800_00, currency: "BRL" },
        { amount: 500_00, currency: "BRL" },
      ],
      identity,
    );
    expect(withOpen.available).toBe(2_700_00);
  });
});

describe("subscriptions totals (doc 02 §2.2-D)", () => {
  it("active monthly subscriptions sum to 839.46 in the sample", () => {
    // Representative slice: the sheet's O103 sums only ACTIVE + monthly rows.
    const subs = [
      { amount: 27_90, frequency: "monthly", active: true },
      { amount: 19_90, frequency: "monthly", active: true },
      { amount: 62_55, frequency: "monthly", active: true },
      { amount: 106_43, frequency: "monthly", active: true },
      { amount: 48_00, frequency: "every_3", active: false }, // Nintendo: inactive
      { amount: 34_90, frequency: "every_6", active: true }, // Endel: not monthly
      { amount: 27_93, frequency: "monthly", active: true },
      { amount: 594_75, frequency: "monthly", active: true }, // remaining monthly actives
    ];
    const monthlyActive = subs
      .filter((s) => s.active && s.frequency === "monthly")
      .reduce((total, s) => total + s.amount, 0);
    expect(monthlyActive).toBe(839_46);
  });
});

describe("yield accrual (doc 04 §4.11, stage 6 golden)", () => {
  it("12%/yr on R$10.000,00 accrues R$100,00 per month", () => {
    expect(monthlyYieldAccrual(1_000_000, 1200)).toBe(10_000);
    expect(monthlyYieldAccrual(1_000_000, 1200, "annual")).toBe(10_000);
  });

  it("a monthly-quoted rate applies as-is (1%/mo on R$10.000,00 → R$100,00)", () => {
    expect(monthlyYieldAccrual(1_000_000, 100, "monthly")).toBe(10_000);
    // ~120% of CDI quoted monthly, e.g. 1.05%/mo → 105 bps
    expect(monthlyYieldAccrual(1_000_000, 105, "monthly")).toBe(10_500);
  });

  it("catch-up compounds whole months and preserves the remainder", () => {
    const last = new Date("2026-05-01T12:00:00Z");
    const now = new Date("2026-07-15T12:00:00Z"); // 2 whole months + 14 days
    const result = yieldCatchUp(1_000_000, 1200, "annual", last, now);
    expect(result.months).toBe(2);
    expect(result.accrued).toBe(10_000 + 10_100); // compounding
    expect(result.newBalance).toBe(1_020_100);
    expect(result.nextLastAccruedAt.toISOString()).toBe(
      addMonthsToTimestamp(last, 2).toISOString(),
    );
  });

  it("does nothing inside the same month and starts the clock on null", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    expect(
      yieldCatchUp(1_000_000, 1200, "annual", new Date("2026-07-01T00:00:00Z"), now).months,
    ).toBe(0);
    const fresh = yieldCatchUp(1_000_000, 1200, "annual", null, now);
    expect(fresh.months).toBe(0);
    expect(fresh.nextLastAccruedAt).toBe(now);
  });
});

describe("purchase plans (doc 04 §4.12)", () => {
  it("lump sum emits a single outflow in the start month", () => {
    const outflows = planOutflows({
      totalAmount: 120_000_00,
      mode: "lump_sum",
      installments: null,
      startDate: "2026-09-15",
    });
    expect(outflows).toHaveLength(1);
    expect(outflows[0]).toMatchObject({ month: "2026-09", amount: 120_000_00 });
  });

  it("installments split evenly with the LAST absorbing the remainder (stage 7 golden)", () => {
    const outflows = planOutflows({
      totalAmount: 120_000_00, // not divisible by 24? 12,000,000 / 24 = 500,000 exactly
      mode: "installments",
      installments: 24,
      startDate: "2026-09-10",
    });
    expect(outflows).toHaveLength(24);
    expect(outflows.reduce((sum, o) => sum + o.amount, 0)).toBe(120_000_00);

    const uneven = planOutflows({
      totalAmount: 100_00,
      mode: "installments",
      installments: 3,
      startDate: "2026-01-31",
    });
    expect(uneven.map((o) => o.amount)).toEqual([33_33, 33_33, 33_34]);
    // Day 31 clamps per month, months step monthly
    expect(uneven.map((o) => o.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("month helpers (doc 04 §4.14)", () => {
  it("does month arithmetic across year boundaries", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthDiff("2026-01", "2027-03")).toBe(14);
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
  });

  it("counts whole months between timestamps", () => {
    const from = new Date("2026-05-01T12:00:00Z");
    expect(wholeMonthsBetween(from, new Date("2026-05-20T12:00:00Z"))).toBe(0);
    expect(wholeMonthsBetween(from, new Date("2026-07-01T12:00:00Z"))).toBe(2);
    expect(wholeMonthsBetween(from, from)).toBe(0);
  });
});
