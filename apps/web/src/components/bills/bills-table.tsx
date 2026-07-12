"use client";
// TanStack Table v8 hands out referentially-stable column/header objects and
// mutates state behind them, which React Compiler's auto-memoization can't
// see — headers would keep stale sort/filter UI. Opt this module out.
"use no memo";

import type { Currency } from "@balance-point/money";
import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
import { Checkbox } from "@balance-point/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@balance-point/ui/components/dropdown-menu";
import { Input } from "@balance-point/ui/components/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@balance-point/ui/components/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@balance-point/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { Spinner } from "@balance-point/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@balance-point/ui/components/table";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  FilterIcon,
  MoreHorizontalIcon,
  RefreshCcwIcon,
  SearchXIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { PayBillButton } from "@/components/bills/pay-bill-button";
import { CurrencyChip } from "@/components/currency-chip";
import { type MessageKey, useFormat, useT } from "@/i18n";
import type { BillRow, CategoryRow } from "@/lib/api-types";
import { type BillStatus, billStatus, formatMoney } from "@/lib/format";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Extra classes applied to this column's th / td. */
    headerClassName?: string;
    cellClassName?: string;
  }
}

/** Row-level callbacks + view state, passed through TanStack's table meta. */
export interface BillsTableMeta {
  displayCurrency: Currency;
  selected: Set<string>;
  /** All-periods search fallback shows the year on due dates. */
  showYear: boolean;
  onToggleRow: (id: string) => void;
  onSetSelected: (ids: Set<string>) => void;
  onPaid: (bill: BillRow) => void;
  onUnpay: (bill: BillRow) => void;
  onSetWontPay: (bill: BillRow, wontPay: boolean) => void;
  onEdit: (bill: BillRow) => void;
  onDelete: (bill: BillRow) => void;
}

export const UNCATEGORIZED = "__uncategorized__";

/** Only unpaid, payable, non-card rows can join bulk payment (doc 09 §9.3). */
export function isSelectable(bill: BillRow): boolean {
  return !bill.paid && !bill.wontPay && !bill.creditCardId;
}

export const UNPAID_STATUSES: BillStatus[] = ["overdue", "due-soon", "pending", "on-card"];

/** Default view: unpaid bills only, nearest due date / most overdue on top. */
export const DEFAULT_SORTING: SortingState = [{ id: "dueDate", desc: false }];

/** Explicit status sort: unpaid first, paid and won't-pay sink to the bottom. */
const STATUS_RANK: Record<BillStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  pending: 2,
  "on-card": 3,
  paid: 4,
  "wont-pay": 5,
};

const STATUS_BADGE: Record<BillStatus, { labelKey: MessageKey; className: string }> = {
  paid: { labelKey: "status.paid", className: "bg-success/15 text-success" },
  overdue: { labelKey: "status.overdue", className: "bg-destructive/15 text-destructive" },
  "due-soon": { labelKey: "status.dueSoon", className: "bg-warning/15 text-warning" },
  pending: { labelKey: "status.pending", className: "bg-muted text-muted-foreground" },
  "on-card": { labelKey: "status.onCard", className: "bg-primary/10 text-primary/80" },
  "wont-pay": {
    labelKey: "status.wontPay",
    className: "bg-muted text-muted-foreground/80 line-through",
  },
};

const STATUS_OPTIONS: BillStatus[] = [
  "overdue",
  "due-soon",
  "pending",
  "on-card",
  "paid",
  "wont-pay",
];

/** Accent/case-insensitive haystack match (São Paulo ⇢ "sao"). */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function matchesBillSearch(bill: BillRow, needle: string): boolean {
  const normalized = normalize(needle.trim());
  if (!normalized) return true;
  return [
    bill.name,
    bill.category?.name,
    bill.sourceAccount?.name,
    bill.creditCard?.name,
    bill.statementCard?.name,
  ].some((hay) => hay != null && normalize(hay).includes(normalized));
}

interface AmountBounds {
  min?: number;
  max?: number;
}

/**
 * Same predicates the table's filterFns apply, as a plain function — the page
 * uses it to detect "no local match" and trigger the all-periods search
 * fallback without a round-trip through the table instance.
 */
export function filterBills(
  rows: BillRow[],
  columnFilters: ColumnFiltersState,
  search: string,
): BillRow[] {
  return rows.filter((bill) => {
    if (!matchesBillSearch(bill, search)) return false;
    for (const filter of columnFilters) {
      const value = filter.value;
      const list = Array.isArray(value) ? (value as string[]) : undefined;
      switch (filter.id) {
        case "status":
          if (list?.length && !list.includes(billStatus(bill))) return false;
          break;
        case "type":
          if (
            list?.length &&
            !list.includes(
              bill.statementCardId
                ? "statement"
                : bill.recurringExpenseId
                  ? "recurring"
                  : "oneoff",
            )
          )
            return false;
          break;
        case "category":
          if (list?.length && !list.includes(bill.categoryId ?? UNCATEGORIZED)) return false;
          break;
        case "account":
          if (list?.length && !list.includes(bill.sourceAccountId ?? "")) return false;
          break;
        case "amount": {
          const { min, max } = (value ?? {}) as AmountBounds;
          const major = bill.amount / 100;
          if (min !== undefined && major < min) return false;
          if (max !== undefined && major > max) return false;
          break;
        }
      }
    }
    return true;
  });
}

const searchEverything: FilterFn<BillRow> = (row, _columnId, rawValue) =>
  matchesBillSearch(row.original, String(rawValue ?? ""));

const includedIn: FilterFn<BillRow> = (row, columnId, rawValue) => {
  const value = rawValue as string[] | undefined;
  return !value || value.length === 0 || value.includes(String(row.getValue(columnId)));
};

// Bounds are typed in major units (R$ 100 → 100); amounts are stored in cents.
const amountWithin: FilterFn<BillRow> = (row, _columnId, rawValue) => {
  const { min, max } = (rawValue ?? {}) as AmountBounds;
  const major = row.original.amount / 100;
  if (min !== undefined && major < min) return false;
  if (max !== undefined && major > max) return false;
  return true;
};

function tableMeta(table: { options: { meta?: unknown } }): BillsTableMeta {
  return table.options.meta as BillsTableMeta;
}

/** Sort toggle + optional filter control rendered inside a column header. */
function SortHeader({
  column,
  label,
  align,
  children,
}: {
  column: Column<BillRow, unknown>;
  label: string;
  align?: "right";
  children?: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  return (
    <div className={`flex items-center gap-0.5 ${align === "right" ? "justify-end" : ""}`}>
      <Button
        variant="ghost"
        size="xs"
        className={`-mx-1.5 gap-1 px-1.5 font-medium ${sorted ? "text-foreground" : "text-muted-foreground"}`}
        onClick={column.getToggleSortingHandler()}
      >
        {label}
        {sorted === "asc" ? (
          <ArrowUpIcon className="text-primary" />
        ) : sorted === "desc" ? (
          <ArrowDownIcon className="text-primary" />
        ) : (
          <ChevronsUpDownIcon className="opacity-0 transition-opacity group-hover/button:opacity-50" />
        )}
      </Button>
      {children}
    </div>
  );
}

/** Checkbox-list column filter (type, category, status). */
function MultiSelectFilter({
  column,
  label,
  options,
}: {
  column: Column<BillRow, unknown>;
  label: string;
  options: { value: string; label: React.ReactNode }[];
}) {
  const t = useT();
  const value = (column.getFilterValue() as string[] | undefined) ?? [];
  const active = value.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className={active ? "text-primary" : "text-muted-foreground/50"}
          />
        }
      >
        <FilterIcon className={active ? "fill-current" : ""} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-44 bg-card">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.includes(option.value)}
            closeOnClick
            onCheckedChange={(checked) => {
              const next = checked
                ? [...value, option.value]
                : value.filter((v) => v !== option.value);
              column.setFilterValue(next.length > 0 ? next : undefined);
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>
              {t("bills.clearFilter")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Min/max (major units) column filter for the amount column. */
function AmountFilter({ column, label }: { column: Column<BillRow, unknown>; label: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const value = (column.getFilterValue() as AmountBounds | undefined) ?? {};
  const active = value.min !== undefined || value.max !== undefined;

  function update(next: AmountBounds) {
    const cleaned: AmountBounds = {};
    if (next.min !== undefined && Number.isFinite(next.min)) cleaned.min = next.min;
    if (next.max !== undefined && Number.isFinite(next.max)) cleaned.max = next.max;
    column.setFilterValue(
      cleaned.min === undefined && cleaned.max === undefined ? undefined : cleaned,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className={active ? "text-primary" : "text-muted-foreground/50"}
          />
        }
      >
        <FilterIcon className={active ? "fill-current" : ""} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto gap-2 bg-card p-2.5">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={t("bills.minAmount")}
            aria-label={t("bills.minAmount")}
            className="h-7 w-24"
            value={value.min ?? ""}
            onChange={(e) =>
              update({ ...value, min: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={t("bills.maxAmount")}
            aria-label={t("bills.maxAmount")}
            className="h-7 w-24"
            value={value.max ?? ""}
            onChange={(e) =>
              update({ ...value, max: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="xs"
            className="self-end text-muted-foreground"
            onClick={() => {
              column.setFilterValue(undefined);
              setOpen(false);
            }}
          >
            {t("bills.clearFilter")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function useBillColumns(categories: CategoryRow[]): ColumnDef<BillRow>[] {
  const t = useT();
  const { formatDate } = useFormat();

  return useMemo<ColumnDef<BillRow>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        meta: { headerClassName: "w-10", cellClassName: "w-10" },
        header: ({ table }) => {
          const meta = tableMeta(table);
          const selectableIds = table
            .getFilteredRowModel()
            .rows.filter((row) => isSelectable(row.original))
            .map((row) => row.original.id);
          const selectedCount = selectableIds.filter((id) => meta.selected.has(id)).length;
          const all = selectableIds.length > 0 && selectedCount === selectableIds.length;
          return (
            <Checkbox
              checked={all}
              indeterminate={selectedCount > 0 && !all}
              disabled={selectableIds.length === 0}
              onCheckedChange={() => meta.onSetSelected(all ? new Set() : new Set(selectableIds))}
              aria-label={t("bills.selectAll")}
            />
          );
        },
        cell: ({ row, table }) => {
          const meta = tableMeta(table);
          const bill = row.original;
          if (!isSelectable(bill)) return null;
          return (
            <Checkbox
              checked={meta.selected.has(bill.id)}
              onCheckedChange={() => meta.onToggleRow(bill.id)}
              aria-label={t("bills.select", { name: bill.name })}
            />
          );
        },
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => <SortHeader column={column} label={t("bills.colName")} />,
        cell: ({ row }) => {
          const bill = row.original;
          return (
            <div className="flex max-w-48 flex-col">
              <span
                className={`truncate text-xs font-medium ${bill.wontPay ? "text-muted-foreground" : ""}`}
              >
                {bill.name}
                {bill.installmentNumber && bill.installmentTotal ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {bill.installmentNumber}/{bill.installmentTotal}
                  </span>
                ) : null}
              </span>
              {bill.creditCardId ? (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground lg:hidden">
                  <CreditCardIcon className="size-3" /> {bill.creditCard?.name}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "type",
        accessorFn: (bill) =>
          bill.statementCardId ? "statement" : bill.recurringExpenseId ? "recurring" : "oneoff",
        filterFn: includedIn,
        meta: { headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
        header: ({ column }) => (
          <SortHeader column={column} label={t("bills.colType")}>
            <MultiSelectFilter
              column={column}
              label={t("bills.filterAria", { column: t("bills.colType") })}
              options={[
                { value: "statement", label: t("bills.typeStatement") },
                { value: "recurring", label: t("bills.typeRecurring") },
                { value: "oneoff", label: t("bills.typeOneOff") },
              ]}
            />
          </SortHeader>
        ),
        cell: ({ row }) =>
          row.original.statementCardId ? (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <CreditCardIcon className="size-3" /> {t("bills.typeStatement")}
            </Badge>
          ) : row.original.recurringExpenseId ? (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <RefreshCcwIcon className="size-3" /> {t("bills.typeRecurring")}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">{t("bills.typeOneOff")}</span>
          ),
      },
      {
        id: "category",
        accessorFn: (bill) => bill.categoryId ?? UNCATEGORIZED,
        sortingFn: (a, b) =>
          (a.original.category?.name ?? "").localeCompare(b.original.category?.name ?? ""),
        filterFn: includedIn,
        meta: { headerClassName: "hidden md:table-cell", cellClassName: "hidden md:table-cell" },
        header: ({ column }) => (
          <SortHeader column={column} label={t("bills.colCategory")}>
            <MultiSelectFilter
              column={column}
              label={t("bills.filterAria", { column: t("bills.colCategory") })}
              options={[
                ...categories.map((c) => ({ value: c.id, label: c.name })),
                { value: UNCATEGORIZED, label: t("common.uncategorized") },
              ]}
            />
          </SortHeader>
        ),
        cell: ({ row }) =>
          row.original.category ? (
            <Badge
              variant="outline"
              className="text-[10px]"
              style={
                row.original.category.color ? { color: row.original.category.color } : undefined
              }
            >
              {row.original.category.name}
            </Badge>
          ) : null,
      },
      {
        id: "account",
        accessorFn: (bill) => bill.sourceAccount?.name ?? bill.creditCard?.name ?? "",
        filterFn: (row, _columnId, rawValue) => {
          const value = rawValue as string[] | undefined;
          return (
            !value || value.length === 0 || value.includes(row.original.sourceAccountId ?? "")
          );
        },
        meta: { headerClassName: "hidden lg:table-cell", cellClassName: "hidden lg:table-cell" },
        header: ({ column }) => <SortHeader column={column} label={t("bills.colAccount")} />,
        cell: ({ row }) =>
          row.original.creditCard ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CreditCardIcon className="size-3" /> {row.original.creditCard.name}
            </span>
          ) : row.original.sourceAccount ? (
            <span className="text-xs text-muted-foreground">
              {row.original.sourceAccount.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          ),
      },
      {
        id: "dueDate",
        accessorKey: "dueDate",
        header: ({ column }) => <SortHeader column={column} label={t("bills.colDue")} />,
        cell: ({ row, table }) => {
          const status = billStatus(row.original);
          return (
            <span
              className={`text-xs tabular-nums ${
                status === "overdue"
                  ? "text-destructive"
                  : status === "due-soon"
                    ? "text-warning"
                    : ""
              }`}
            >
              {formatDate(row.original.dueDate, { withYear: tableMeta(table).showYear })}
            </span>
          );
        },
      },
      {
        id: "amount",
        accessorKey: "amount",
        sortingFn: "basic",
        filterFn: amountWithin,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        header: ({ column }) => (
          <SortHeader column={column} label={t("bills.colAmount")} align="right">
            <AmountFilter
              column={column}
              label={t("bills.filterAria", { column: t("bills.colAmount") })}
            />
          </SortHeader>
        ),
        cell: ({ row, table }) => {
          const bill = row.original;
          return (
            <span
              className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${
                bill.wontPay ? "text-muted-foreground line-through" : ""
              }`}
            >
              <CurrencyChip
                currency={bill.currency}
                show={bill.currency !== tableMeta(table).displayCurrency}
              />
              {formatMoney(bill.amount, bill.currency)}
            </span>
          );
        },
      },
      {
        id: "status",
        accessorFn: (bill) => billStatus(bill),
        sortingFn: (a, b) => {
          const rank = STATUS_RANK[billStatus(a.original)] - STATUS_RANK[billStatus(b.original)];
          return rank !== 0 ? rank : a.original.dueDate.localeCompare(b.original.dueDate);
        },
        filterFn: includedIn,
        meta: { headerClassName: "w-40 text-right", cellClassName: "text-right" },
        header: ({ column }) => (
          <SortHeader column={column} label={t("bills.colStatus")} align="right">
            <MultiSelectFilter
              column={column}
              label={t("bills.filterAria", { column: t("bills.colStatus") })}
              options={STATUS_OPTIONS.map((status) => ({
                value: status,
                label: t(STATUS_BADGE[status].labelKey),
              }))}
            />
          </SortHeader>
        ),
        cell: ({ row, table }) => {
          const meta = tableMeta(table);
          const bill = row.original;
          const badge = STATUS_BADGE[billStatus(bill)];
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Badge className={`border-transparent text-[10px] ${badge.className}`}>
                {t(badge.labelKey)}
              </Badge>
              {isSelectable(bill) ? (
                <PayBillButton bill={bill} onPaid={() => meta.onPaid(bill)} />
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        meta: { headerClassName: "w-10", cellClassName: "w-10" },
        header: () => null,
        cell: ({ row, table }) => {
          const meta = tableMeta(table);
          const bill = row.original;
          const isCardCharge = Boolean(bill.creditCardId);
          return (
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
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40 bg-card">
                <DropdownMenuItem onClick={() => meta.onEdit(bill)}>
                  {t("common.edit")}
                </DropdownMenuItem>
                {bill.paid && !isCardCharge ? (
                  <DropdownMenuItem onClick={() => meta.onUnpay(bill)}>
                    {t("bills.markUnpaid")}
                  </DropdownMenuItem>
                ) : null}
                {!bill.paid && !isCardCharge ? (
                  bill.wontPay ? (
                    <DropdownMenuItem onClick={() => meta.onSetWontPay(bill, false)}>
                      {t("bills.unmarkWontPay")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => meta.onSetWontPay(bill, true)}>
                      {t("bills.markWontPay")}
                    </DropdownMenuItem>
                  )
                ) : null}
                <DropdownMenuItem variant="destructive" onClick={() => meta.onDelete(bill)}>
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t, formatDate, categories],
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

/** 1-based page list with ellipsis gaps: 1 … 4 5 6 … 12. */
function pageNumbers(current: number, count: number): (number | "ellipsis")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = [...new Set([1, current - 1, current, current + 1, count])]
    .filter((p) => p >= 1 && p <= count)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (const [i, p] of wanted.entries()) {
    if (i > 0 && p - wanted[i - 1]! > 1) out.push("ellipsis");
    out.push(p);
  }
  return out;
}

export function BillsTable({
  rows,
  categories,
  globalFilter,
  onGlobalFilterChange,
  columnFilters,
  onColumnFiltersChange,
  onClearFilters,
  isFetching = false,
  searchingFallback = false,
  meta,
}: {
  rows: BillRow[];
  categories: CategoryRow[];
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  onClearFilters: () => void;
  /** Background refetch (range switch with placeholder data) dims the table. */
  isFetching?: boolean;
  /** All-periods search fallback in flight — show a spinner instead of "no match". */
  searchingFallback?: boolean;
  meta: BillsTableMeta;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const columns = useBillColumns(categories);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, globalFilter, pagination },
    meta,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange,
    onGlobalFilterChange: (updater) =>
      onGlobalFilterChange(
        typeof updater === "function"
          ? (updater as (old: string) => string)(globalFilter)
          : String(updater ?? ""),
      ),
    globalFilterFn: searchEverything,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  // Back to page 1 when the working set changes; clamp when rows shrink.
  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [columnFilters, globalFilter]);
  useEffect(() => {
    setPagination((prev) =>
      pageCount > 0 && prev.pageIndex >= pageCount
        ? { ...prev, pageIndex: pageCount - 1 }
        : prev,
    );
  }, [pageCount]);

  const firstRow = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(filteredCount, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`overflow-x-auto rounded-lg ring-1 ring-foreground/10 transition-opacity ${
          isFetching ? "opacity-60" : ""
        }`}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.headerClassName}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {filteredCount === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {searchingFallback ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" /> {t("bills.searchingAll")}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                      <SearchXIcon className="size-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{t("bills.noMatchTitle")}</p>
                      <Button variant="outline" size="xs" onClick={onClearFilters}>
                        {t("bills.clearFilters")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              // No exit animations: with sorting + pagination, exiting rows
              // would hold their slot and leave visual gaps mid-flip.
              table.getRowModel().rows.map((row) => (
                <motion.tr
                  key={row.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40 data-[selected=true]:bg-primary/5"
                  data-selected={meta.selected.has(row.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.cellClassName}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t("bills.pageInfo", { from: firstRow, to: lastRow, count: filteredCount })}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">{t("bills.rowsPerPage")}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
                items={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              >
                <SelectTrigger size="sm" aria-label={t("bills.rowsPerPage")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-label={t("bills.pagePrev")}
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                  />
                </PaginationItem>
                {pageNumbers(pageIndex + 1, Math.max(1, pageCount)).map((item, i) => (
                  <PaginationItem key={item === "ellipsis" ? `e-${i}` : item}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={item === pageIndex + 1}
                        onClick={() => table.setPageIndex(item - 1)}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    aria-label={t("bills.pageNext")}
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Structured placeholder mirroring the table layout (doc 08 §8.6). */
export function BillsTableSkeleton() {
  const nameWidths = ["w-36", "w-44", "w-28", "w-40", "w-32"];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <div className="flex h-10 items-center gap-4 border-b border-border bg-muted/30 px-3">
          <Skeleton className="size-4 rounded-md" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="hidden h-3 w-10 sm:block" />
          <Skeleton className="hidden h-3 w-16 md:block" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="ml-auto h-3 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-3 py-2.5 last:border-0"
          >
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className={`h-3.5 ${nameWidths[i % nameWidths.length]}`} />
            <Skeleton className="hidden h-4 w-16 rounded-full sm:block" />
            <Skeleton className="hidden h-4 w-20 rounded-full md:block" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="ml-auto h-3.5 w-20" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-7 w-64" />
      </div>
    </div>
  );
}
