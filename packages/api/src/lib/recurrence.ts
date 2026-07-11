import { type ISODate, type Month, addMonths, dateInMonth, monthOfDate } from "./month";

export interface RecurrenceTemplate {
  frequency: "monthly" | "every_n_months" | "manual";
  intervalMonths: number;
  renewDay: number;
  endMode: "infinite" | "until_date" | "installments";
  endDate: ISODate | null;
  installmentsTotal: number | null;
  startDate: ISODate;
}

export interface Occurrence {
  month: Month;
  dueDate: ISODate;
  installmentNumber: number | null;
}

/**
 * Which months a template charges (doc 04 §4.9). Deterministic and pure:
 * starting at startDate's month, stepping `intervalMonths`, on `renewDay`
 * (clamped to month length). End conditions bound the sequence; `throughMonth`
 * bounds open-ended templates. Installment templates emit exactly N regardless
 * of the horizon so a 12× loan is stamped 1/12..12/12 up front.
 */
export function enumerateOccurrences(t: RecurrenceTemplate, throughMonth: Month): Occurrence[] {
  if (t.frequency === "manual") return [];

  const step = t.frequency === "monthly" ? 1 : Math.max(1, t.intervalMonths);
  const start = monthOfDate(t.startDate);
  const endMonth = t.endMode === "until_date" && t.endDate ? monthOfDate(t.endDate) : null;
  const totalInstallments =
    t.endMode === "installments" ? Math.max(0, t.installmentsTotal ?? 0) : null;

  const occurrences: Occurrence[] = [];
  let month = start;
  let index = 0;
  // Hard cap keeps a bad input from looping forever (~50 years of months).
  const HARD_CAP = 600;

  while (index < HARD_CAP) {
    if (totalInstallments !== null) {
      if (index >= totalInstallments) break;
    } else if (month > throughMonth) {
      break;
    }
    if (endMonth !== null && month > endMonth) break;

    occurrences.push({
      month,
      dueDate: dateInMonth(month, t.renewDay),
      installmentNumber: totalInstallments !== null ? index + 1 : null,
    });
    month = addMonths(month, step);
    index += 1;
  }
  return occurrences;
}
