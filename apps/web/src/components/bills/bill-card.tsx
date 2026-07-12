"use client";

import type { Currency } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";
import { Checkbox } from "@balance-point/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@balance-point/ui/components/dropdown-menu";
import { CreditCardIcon, MoreVerticalIcon, RefreshCcwIcon } from "lucide-react";

import { BillStatusBadge } from "@/components/bills/bill-status-badge";
import { PayBillButton } from "@/components/bills/pay-bill-button";
import { CurrencyChip } from "@/components/currency-chip";
import { useFormat, useT } from "@/i18n";
import type { BillRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";

/**
 * A bill as a phone-sized card (doc 08 §8.8).
 *
 * Deliberately NOT a 1:1 transpose of the table's eight columns — stacking each
 * one as its own `label: value` line would run ~320px per bill (≈2 per screen).
 * Instead the fields are re-ranked into the three lines a person actually scans:
 *
 *   1. what it is + how much          (name · amount)
 *   2. where it comes from            (bank/card · category — 2 fields, hard cap)
 *   3. where it stands + what to do   (status · due date · pay · overflow)
 *
 * `type` is demoted to a leading glyph on line 2 and the rest lives in the edit
 * sheet — that's ~88px per bill, so about eight fit on one screen.
 */
export function BillCard({
  bill,
  displayCurrency,
  showYear,
  selectMode,
  selected,
  selectable,
  onToggle,
  onPaid,
  onUnpay,
  onSetWontPay,
  onEdit,
  onDelete,
}: {
  bill: BillRow;
  displayCurrency: Currency;
  showYear: boolean;
  selectMode: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onPaid: () => void;
  onUnpay: () => void;
  onSetWontPay: (wontPay: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { formatDate } = useFormat();
  const isCardCharge = Boolean(bill.creditCardId);

  // Line 2 — at most two, in priority order. An empty line is dropped entirely
  // rather than reserved, so a bare bill stays two lines tall.
  const source = bill.creditCard?.name ?? bill.sourceAccount?.name;
  const meta = [source, bill.category?.name].filter(Boolean) as string[];

  return (
    <li
      data-selected={selected}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors data-[selected=true]:border-primary/40 data-[selected=true]:bg-primary/5"
    >
      {selectMode && selectable ? (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={t("bills.select", { name: bill.name })}
          className="mt-1"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`truncate text-sm font-semibold ${bill.wontPay ? "text-muted-foreground" : ""}`}
          >
            {bill.name}
            {bill.installmentNumber && bill.installmentTotal ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {bill.installmentNumber}/{bill.installmentTotal}
              </span>
            ) : null}
          </span>
          <span
            className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums ${
              bill.wontPay ? "text-muted-foreground line-through" : ""
            }`}
          >
            <CurrencyChip currency={bill.currency} show={bill.currency !== displayCurrency} />
            {formatMoney(bill.amount, bill.currency)}
          </span>
        </div>

        {meta.length > 0 ? (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {isCardCharge ? (
              <CreditCardIcon className="size-3 shrink-0" aria-hidden />
            ) : bill.recurringExpenseId ? (
              <RefreshCcwIcon className="size-3 shrink-0" aria-hidden />
            ) : null}
            <span className="truncate">{meta.join(" · ")}</span>
          </p>
        ) : null}

        <div className="mt-1 flex items-center gap-2">
          <BillStatusBadge bill={bill} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(bill.dueDate, { withYear: showYear })}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {selectable && !selectMode ? (
              <PayBillButton bill={bill} size="xs" onPaid={onPaid} />
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("common.actionsFor", { name: bill.name })}
                  />
                }
              >
                <MoreVerticalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-44 bg-card">
                <DropdownMenuItem onClick={onEdit}>{t("common.edit")}</DropdownMenuItem>
                {bill.paid && !isCardCharge ? (
                  <DropdownMenuItem onClick={onUnpay}>{t("bills.markUnpaid")}</DropdownMenuItem>
                ) : null}
                {!bill.paid && !isCardCharge ? (
                  <DropdownMenuItem onClick={() => onSetWontPay(!bill.wontPay)}>
                    {bill.wontPay ? t("bills.unmarkWontPay") : t("bills.markWontPay")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Placeholder matching the card's three lines. */
export function BillCardSkeleton({ rows = 6 }: { rows?: number }) {
  const widths = ["w-32", "w-40", "w-24", "w-36", "w-28", "w-44"];
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className={`h-4 animate-pulse rounded-md bg-muted ${widths[i % widths.length]}`} />
            <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
          <div className="mt-1 flex items-center gap-2">
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded-md bg-muted" />
            <div className="ml-auto h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
