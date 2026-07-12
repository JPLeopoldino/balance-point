"use client";

import type { Currency, Money } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@balance-point/ui/components/empty";
import { Input } from "@balance-point/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@balance-point/ui/components/tabs";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { PlusIcon, ReceiptIcon, SearchIcon } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BillFormDialog } from "@/components/bills/bill-form-dialog";
import {
  BillsTable,
  type BillsTableMeta,
  BillsTableSkeleton,
  filterBills,
  isSelectable,
  UNPAID_STATUSES,
} from "@/components/bills/bills-table";
import {
  type BillsRange,
  DateRangeFilter,
  monthToRange,
  rangeMonth,
} from "@/components/bills/date-range-filter";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KpiSummary } from "@/components/kpi-summary";
import { PageHeader } from "@/components/page-header";
import type { RecurringPrefill } from "@/components/recurring/recurring-form-dialog";
import { RecurringTemplates } from "@/components/recurring/recurring-templates";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { useT } from "@/i18n";
import type { BillRow } from "@/lib/api-types";
import { currentMonth, formatMoney } from "@/lib/format";
import { billMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

const ALL = "__all__";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Default view filters unpaid bills; ?filter=paid|wontpay|all deep links
 * override the status column filter.
 */
function initialColumnFilters(filter: string | null): ColumnFiltersState {
  if (filter === "paid") return [{ id: "status", value: ["paid"] }];
  if (filter === "wontpay") return [{ id: "status", value: ["wont-pay"] }];
  if (filter === "all") return [];
  return [{ id: "status", value: [...UNPAID_STATUSES] }];
}

/** Debounced copy of a fast-changing value (search input → fallback query). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function BillsPage() {
  const t = useT();
  const { currency: displayCurrency } = useDisplayCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Recurring templates live in a tab here (?tab=recurring deep links).
  const [tab, setTab] = useState(
    searchParams.get("tab") === "recurring" ? "recurring" : "bills",
  );
  // The bill form's "make recurring" pushes ?tab=recurring onto this same
  // route — follow the URL when it changes.
  useEffect(() => {
    setTab(searchParams.get("tab") === "recurring" ? "recurring" : "bills");
  }, [searchParams]);
  // "Make recurring" prefill forwarded by the bill form (doc 09 §9.3).
  const recurringPrefill = useMemo<RecurringPrefill | undefined>(() => {
    const name = searchParams.get("name");
    const amount = searchParams.get("amount");
    const currencyParam = searchParams.get("currency");
    if (!name && !amount) return undefined;
    return {
      name: name ?? undefined,
      amount: amount && /^\d+$/.test(amount) ? Number(amount) : undefined,
      currency: currencyParam === "USD" ? "USD" : "BRL",
    };
  }, [searchParams]);

  // Due-date window, persisted in the URL (?from/?to; legacy ?month accepted).
  const [range, setRange] = useState<BillsRange>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to && ISO_DATE_RE.test(from) && ISO_DATE_RE.test(to)) {
      return from <= to ? { from, to } : { from: to, to: from };
    }
    const month = searchParams.get("month");
    if (month && MONTH_RE.test(month)) return monthToRange(month);
    return monthToRange(currentMonth());
  });

  function updateRange(next: BillsRange) {
    setRange(next);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("month");
    if (rangeMonth(next) === currentMonth()) {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", next.from);
      params.set("to", next.to);
    }
    const query = params.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
  }

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    initialColumnFilters(searchParams.get("filter")),
  );
  // Search filters client-side through the already-fetched rows — no refetch per keystroke.
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payFromOverride, setPayFromOverride] = useState(ALL);
  const [editing, setEditing] = useState<BillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BillRow | null>(null);

  const bills = useQuery({
    ...trpc.bills.list.queryOptions({ from: range.from, to: range.to }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    ...trpc.bills.rangeSummary.queryOptions({ from: range.from, to: range.to }),
    placeholderData: keepPreviousData,
  });
  const accounts = useQuery(trpc.accounts.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());

  const rows = useMemo(() => bills.data ?? [], [bills.data]);

  // Smart search: when the term misses everything in the current period+filters,
  // search all periods ignoring filters (debounced — never one fetch per key).
  const fallbackTerm = debouncedSearch.trim();
  const localMisses =
    fallbackTerm !== "" && filterBills(rows, columnFilters, fallbackTerm).length === 0;
  const fallback = useQuery({
    ...trpc.bills.list.queryOptions({ search: fallbackTerm, allTime: true }),
    enabled: !bills.isLoading && localMisses,
    placeholderData: keepPreviousData,
  });
  const fallbackRows = useMemo(() => fallback.data ?? [], [fallback.data]);
  const showFallback = localMisses && !fallback.isLoading && fallbackRows.length > 0;
  const searchingFallback = localMisses && (fallback.isLoading || fallback.isFetching);

  const unpayMutation = useMutation(billMutations.unpay());
  const wontPayMutation = useMutation(billMutations.setWontPay());
  const bulkPayMutation = useMutation(billMutations.bulkPay());
  const deleteMutation = useMutation(billMutations.delete());

  const s = summary.data;
  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived);

  // Drop selections that left the window or stopped being payable.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(rows.filter((b) => prev.has(b.id) && isSelectable(b)).map((b) => b.id));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const selectedRows = rows.filter((b) => selected.has(b.id));
  const selectedByCurrency = useMemo(() => {
    const totals = new Map<Currency, Money>();
    for (const row of selectedRows) {
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
    }
    return [...totals.entries()];
  }, [selectedRows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deselect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function unpaySingle(bill: BillRow) {
    unpayMutation.mutate(
      { id: bill.id },
      {
        onSuccess: (result) => {
          toast.success(t("bills.unpaidToast", { name: result.bill.name }));
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function setWontPayFor(bill: BillRow, wontPay: boolean) {
    deselect(bill.id);
    wontPayMutation.mutate(
      { id: bill.id, wontPay },
      {
        onSuccess: (result) => {
          toast.success(
            t(wontPay ? "bills.wontPayToast" : "bills.willPayToast", { name: result.name }),
          );
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function bulkPay() {
    const ids = [...selected];
    setSelected(new Set());
    bulkPayMutation.mutate(
      {
        ids,
        fromAccountId: payFromOverride === ALL ? undefined : payFromOverride,
      },
      {
        onSuccess: (result) => {
          toast.success(
            t("bills.bulkPaidToast", {
              count: result.paidCount,
              total: formatMoney(result.totalPaid, result.displayCurrency),
            }),
            {
              description:
                [
                  result.skippedCount > 0
                    ? t("bills.skipped", { count: result.skippedCount })
                    : null,
                  ...result.warnings,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined,
            },
          );
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  // Bank select is just a bound view over the account column filter.
  const accountFilter =
    (columnFilters.find((f) => f.id === "account")?.value as string[] | undefined)?.[0] ?? ALL;
  function setAccountFilter(next: string) {
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== "account");
      return next === ALL ? rest : [...rest, { id: "account", value: [next] }];
    });
  }

  function clearFilters() {
    setColumnFilters([]);
    setSearch("");
  }

  const tableMeta: BillsTableMeta = {
    displayCurrency,
    selected,
    showYear: showFallback,
    onToggleRow: toggle,
    onSetSelected: setSelected,
    onPaid: (bill) => deselect(bill.id),
    onUnpay: unpaySingle,
    onSetWontPay: setWontPayFor,
    onEdit: setEditing,
    onDelete: setDeleting,
  };

  const wholeMonth = rangeMonth(range);
  const summaryLoading = summary.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bills.title")} description={t("page.billsDescription")}>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" /> {t("nav.addBill")}
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab((v as string) ?? "bills")}>
        {/* flex-wrap is the safety net: a long month ("setembro/26") in a narrow
            phone drops the period to its own line instead of being clipped. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="bills">{t("nav.bills")}</TabsTrigger>
            <TabsTrigger value="recurring">{t("nav.recurring")}</TabsTrigger>
          </TabsList>
          {/*
           * On a phone the period rides on the tab row — it's the only spare
           * horizontal space on the screen, and it saves the toolbar a whole
           * line. On desktop it stays with search and bank in the toolbar.
           * It filters bills only, so it's hidden on the Recurring tab.
           */}
          {tab === "bills" ? (
            <div className="md:hidden">
              <DateRangeFilter value={range} onChange={updateRange} compact />
            </div>
          ) : null}
        </div>

        <TabsContent value="bills" className="flex flex-col gap-4">
      {/* Period roll-up in the display currency (doc 04 §4.4) */}
      <KpiSummary
        loading={summaryLoading}
        stats={[
          {
            label: t("bills.summaryTotal"),
            shortLabel: t("bills.summaryTotalShort"),
            value: s?.totalBills ?? 0,
            currency: displayCurrency,
            // Always pass a sublabel — an absent one while loading would make
            // the card shorter, then taller, shifting the row under it.
            sublabel:
              s && s.wontPayCount > 0
                ? `${t("bills.countBills", { count: s.count })} · ${t("bills.wontPayShort", {
                    amount: formatMoney(s.wontPayBills, displayCurrency),
                  })}`
                : t("bills.countBills", { count: s?.count ?? 0 }),
          },
          {
            label: t("bills.summaryPaid"),
            value: s?.paidBills ?? 0,
            currency: displayCurrency,
            sublabel: t("bills.countPaid", { count: s?.paidCount ?? 0 }),
          },
          {
            label: t("bills.summaryRemaining"),
            value: s?.remainingBills ?? 0,
            currency: displayCurrency,
            emphasis: true,
            sublabel: t("bills.countOpen", { count: s?.openCount ?? 0 }),
          },
          {
            label: t("bills.summaryOverdue"),
            value: s?.overdueBills ?? 0,
            currency: displayCurrency,
            destructive: (s?.overdueBills ?? 0) > 0,
            sublabel: t("bills.countOverdue", { count: s?.overdueCount ?? 0 }),
          },
        ]}
      />

      {/*
       * Search · bank · period. Wraps only on a phone — `md:flex-nowrap` makes
       * a second row structurally impossible on desktop, and the search (the
       * one shrinkable item) gives way if the window gets tight.
       */}
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        {/*
         * Search owns the whole first row on a phone. It used to be `flex-1`
         * beside two fixed-width siblings, so its `flex-basis: 0` collapsed it
         * to a ~50px stub the moment the row filled up (~430px wide), and the
         * bank select ended up drawn straight over it.
         */}
        <div className="relative w-full md:w-48 md:min-w-0">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground md:left-2.5 md:size-3.5" />
          <Input
            value={search}
            placeholder={t("bills.searchPlaceholder")}
            className="h-10 w-full pl-10 md:h-8 md:pl-8"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/*
         * Bank and period are desktop-only here: on a phone the bank lives in
         * the filters sheet (with the other column filters it belongs beside)
         * and the period rides on the tab row above.
         */}
        <Select
          value={accountFilter}
          onValueChange={(v) => setAccountFilter((v as string) ?? ALL)}
          items={[
            { value: ALL, label: t("bills.allAccounts") },
            ...activeAccounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        >
          <SelectTrigger size="sm" className="hidden md:flex md:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("bills.allAccounts")}</SelectItem>
            {activeAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden md:flex">
          <DateRangeFilter value={range} onChange={updateRange} />
        </div>
      </div>

      {bills.isLoading ? (
        <BillsTableSkeleton />
      ) : rows.length === 0 && search.trim() === "" ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>{t("bills.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("bills.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}>{t("bills.emptyAdd")}</Button>
              <Button variant="outline" onClick={() => setTab("recurring")}>
                {t("bills.emptyRecurring")}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {showFallback ? (
            <p className="text-xs text-muted-foreground">
              {t("bills.fallbackNotice", { count: fallbackRows.length })}
            </p>
          ) : null}
          <BillsTable
            rows={showFallback ? fallbackRows : rows}
            categories={categories.data ?? []}
            accounts={activeAccounts}
            globalFilter={showFallback ? "" : search}
            onGlobalFilterChange={setSearch}
            columnFilters={showFallback ? [] : columnFilters}
            onColumnFiltersChange={setColumnFilters}
            onClearFilters={clearFilters}
            // The disabled fallback query keeps its last page as placeholder
            // forever, so only let it dim the table while it's actually in use.
            isFetching={bills.isPlaceholderData || (localMisses && fallback.isPlaceholderData)}
            searchingFallback={searchingFallback}
            meta={tableMeta}
          />
        </div>
      )}

      {/*
       * Bulk-select bar (doc 09 §9.3). On a phone it must sit *above* the
       * floating tab bar, not under it — hence `bottom: nav-occupies + 8px`.
       */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(var(--nav-occupies)+0.5rem)] z-40 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5 shadow-lg md:sticky md:inset-x-auto md:bottom-4">
          <span className="text-xs font-medium">
            {t("bills.selected", { count: selected.size })} ·{" "}
            <span className="tabular-nums">
              {selectedByCurrency.map(([cur, total], i) => (
                <span key={cur}>
                  {i > 0 ? " + " : ""}
                  {formatMoney(total, cur)}
                </span>
              ))}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2 max-md:w-full">
            <span className="hidden text-xs text-muted-foreground md:inline">
              {t("bills.payFrom")}
            </span>
            <Select
              value={payFromOverride}
              onValueChange={(v) => setPayFromOverride((v as string) ?? ALL)}
              items={[
                { value: ALL, label: t("bills.eachBillAccount") },
                ...activeAccounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
            >
              <SelectTrigger size="sm" className="min-w-0 flex-1 md:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("bills.eachBillAccount")}</SelectItem>
                {activeAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={bulkPay} disabled={bulkPayMutation.isPending}>
              {bulkPayMutation.isPending
                ? t("bills.paying")
                : t("bills.payN", { count: selected.size })}
            </Button>
          </div>
        </div>
      ) : null}
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringTemplates prefill={recurringPrefill} />
        </TabsContent>
      </Tabs>

      <BillFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        bill={editing}
        defaultDate={wholeMonth ? `${wholeMonth}-05` : range.from}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("bills.deleteTitle", { name: deleting?.name ?? "" })}
        description={
          deleting?.paid ? t("bills.deletePaidDescription") : t("bills.deleteDescription")
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const bill = deleting;
          setDeleting(null);
          deleteMutation.mutate(
            { id: bill.id },
            {
              onSuccess: () => toast.success(t("bills.deletedToast", { name: bill.name })),
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </div>
  );
}
