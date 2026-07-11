"use client";

import type { Currency, Money } from "@balance-point/money";
import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
import { Checkbox } from "@balance-point/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@balance-point/ui/components/dropdown-menu";
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
import { Skeleton } from "@balance-point/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@balance-point/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@balance-point/ui/components/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCardIcon, MoreHorizontalIcon, ReceiptIcon, SearchIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BillFormDialog } from "@/components/bills/bill-form-dialog";
import { PayBillButton } from "@/components/bills/pay-bill-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencyChip } from "@/components/currency-chip";
import type { RecurringPrefill } from "@/components/recurring/recurring-form-dialog";
import { RecurringTemplates } from "@/components/recurring/recurring-templates";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { useMonth } from "@/hooks/use-month";
import { type MessageKey, useFormat, useT } from "@/i18n";
import type { BillRow } from "@/lib/api-types";
import { type BillStatus, billStatus, formatMoney } from "@/lib/format";
import { invalidateMoneyData } from "@/lib/invalidate";
import { trpc } from "@/utils/trpc";

const ALL = "__all__";

type PaidFilter = "all" | "unpaid" | "paid";

export default function BillsPage() {
  const t = useT();
  const { formatMonth } = useFormat();
  const { month } = useMonth();
  const { currency: displayCurrency } = useDisplayCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialFilter = searchParams.get("filter");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>(
    initialFilter === "unpaid" || initialFilter === "paid" ? initialFilter : "all",
  );

  // Recurring bills live here as a view — a recurring bill is still a bill.
  const view = searchParams.get("view") === "recurring" ? "recurring" : "monthly";
  function setView(next: "monthly" | "recurring") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "recurring") params.set("view", "recurring");
    else params.delete("view");
    const query = params.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
  }

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
  const [categoryId, setCategoryId] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payFromOverride, setPayFromOverride] = useState(ALL);
  const [editing, setEditing] = useState<BillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BillRow | null>(null);

  const bills = useQuery(
    trpc.bills.list.queryOptions({
      month,
      paid: paidFilter === "all" ? undefined : paidFilter === "paid",
      categoryId: categoryId === ALL ? undefined : categoryId,
      accountId: accountId === ALL ? undefined : accountId,
      search: search.trim() || undefined,
    }),
  );
  const year = Number(month.slice(0, 4));
  const monthSummary = useQuery(trpc.bills.monthSummary.queryOptions({ year }));
  const accounts = useQuery(trpc.accounts.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());

  const unpayMutation = useMutation(trpc.bills.unpay.mutationOptions());
  const bulkPayMutation = useMutation(trpc.bills.bulkPay.mutationOptions());
  const deleteMutation = useMutation(trpc.bills.delete.mutationOptions());

  const rows = bills.data ?? [];
  const summaryRow = monthSummary.data?.find((r) => r.month === month);
  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived);

  const selectableIds = useMemo(
    () => new Set(rows.filter((b) => !b.paid && !b.creditCardId).map((b) => b.id)),
    [rows],
  );
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

  function toggleAll() {
    setSelected((prev) => (prev.size >= selectableIds.size ? new Set() : new Set(selectableIds)));
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
          invalidateMoneyData();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function bulkPay() {
    bulkPayMutation.mutate(
      {
        ids: [...selected],
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
          setSelected(new Set());
          invalidateMoneyData();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-20">
      {/* Header: view switcher + month totals (doc 09 §9.3) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold">
          {t("bills.title")}{view === "monthly" ? ` — ${formatMonth(month)}` : ""}
        </h2>
        <Tabs value={view} onValueChange={(v) => setView(v as "monthly" | "recurring")}>
          <TabsList>
            <TabsTrigger value="monthly">{t("bills.viewMonthly")}</TabsTrigger>
            <TabsTrigger value="recurring">{t("bills.viewRecurring")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "monthly" ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("bills.totals", {
              total: formatMoney(summaryRow?.totalBills ?? 0, displayCurrency),
              paid: formatMoney(summaryRow?.paidBills ?? 0, displayCurrency),
            })}{" "}
            <span className="font-medium text-foreground">
              {formatMoney(summaryRow?.remainingBills ?? 0, displayCurrency)}
            </span>
          </span>
        ) : null}
      </div>

      {view === "recurring" ? (
        <RecurringTemplates prefill={recurringPrefill} />
      ) : (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={paidFilter} onValueChange={(v) => setPaidFilter(v as PaidFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t("bills.filterAll")}</TabsTrigger>
            <TabsTrigger value="unpaid">{t("bills.filterUnpaid")}</TabsTrigger>
            <TabsTrigger value="paid">{t("bills.filterPaid")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={categoryId}
          onValueChange={(v) => setCategoryId((v as string) ?? ALL)}
          items={[
            { value: ALL, label: t("bills.allCategories") },
            ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("bills.allCategories")}</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={accountId}
          onValueChange={(v) => setAccountId((v as string) ?? ALL)}
          items={[
            { value: ALL, label: t("bills.allAccounts") },
            ...activeAccounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        >
          <SelectTrigger size="sm">
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
        <div className="relative ml-auto">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            placeholder={t("bills.searchPlaceholder")}
            className="h-8 w-44 pl-8"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          {t("bills.addButton")}
        </Button>
      </div>

      {/* Table */}
      {bills.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>{t("bills.emptyTitle", { month: formatMonth(month) })}</EmptyTitle>
            <EmptyDescription>{t("bills.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}>{t("bills.emptyAdd")}</Button>
              <Button variant="outline" onClick={() => setView("recurring")}>
                {t("bills.emptyRecurring")}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size > 0 && selected.size >= selectableIds.size}
                    indeterminate={selected.size > 0 && selected.size < selectableIds.size}
                    onCheckedChange={toggleAll}
                    aria-label={t("bills.selectAll")}
                  />
                </TableHead>
                <TableHead>{t("bills.colName")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("bills.colCategory")}</TableHead>
                <TableHead>{t("bills.colDue")}</TableHead>
                <TableHead className="text-right">{t("bills.colAmount")}</TableHead>
                <TableHead className="w-36 text-right">{t("bills.colStatus")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {rows.map((row) => (
                  <BillTableRow
                    key={row.id}
                    bill={row}
                    displayCurrency={displayCurrency}
                    selected={selected.has(row.id)}
                    selectable={selectableIds.has(row.id)}
                    onToggle={() => toggle(row.id)}
                    onPaid={() => deselect(row.id)}
                    onUnpay={() => unpaySingle(row)}
                    onEdit={() => setEditing(row)}
                    onDelete={() => setDeleting(row)}
                  />
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk-select bar (doc 09 §9.3) */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-20 z-40 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg md:sticky md:bottom-4 md:inset-x-auto">
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("bills.payFrom")}</span>
            <Select
              value={payFromOverride}
              onValueChange={(v) => setPayFromOverride((v as string) ?? ALL)}
              items={[
                { value: ALL, label: t("bills.eachBillAccount") },
                ...activeAccounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
            >
              <SelectTrigger size="sm">
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
              {bulkPayMutation.isPending ? t("bills.paying") : t("bills.payN", { count: selected.size })}
            </Button>
          </div>
        </div>
      ) : null}

      <BillFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        bill={editing}
        defaultDate={`${month}-05`}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("bills.deleteTitle", { name: deleting?.name ?? "" })}
        description={deleting?.paid ? t("bills.deletePaidDescription") : t("bills.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(
            { id: deleting.id },
            {
              onSuccess: () => {
                toast.success(t("bills.deletedToast", { name: deleting.name }));
                setDeleting(null);
                invalidateMoneyData();
              },
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
        </>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<BillStatus, { labelKey: MessageKey; className: string }> = {
  paid: { labelKey: "status.paid", className: "bg-success/15 text-success" },
  overdue: { labelKey: "status.overdue", className: "bg-destructive/15 text-destructive" },
  "due-soon": { labelKey: "status.dueSoon", className: "bg-warning/15 text-warning" },
  pending: { labelKey: "status.pending", className: "bg-muted text-muted-foreground" },
};

function BillTableRow({
  bill,
  displayCurrency,
  selected,
  selectable,
  onToggle,
  onPaid,
  onUnpay,
  onEdit,
  onDelete,
}: {
  bill: BillRow;
  displayCurrency: Currency;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onPaid: () => void;
  onUnpay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { formatDate } = useFormat();
  const reduced = useReducedMotion();
  const status = billStatus(bill);
  const badge = STATUS_BADGE[status];
  const isCardCharge = Boolean(bill.creditCardId);

  return (
    <motion.tr
      layout={!reduced}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0, height: 0 }}
      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40 data-[selected=true]:bg-primary/5"
      data-selected={selected}
    >
      <TableCell className="w-10">
        {selectable ? (
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={t("bills.select", { name: bill.name })}
          />
        ) : null}
      </TableCell>
      <TableCell className="max-w-48">
        <div className="flex flex-col">
          <span className="truncate text-xs font-medium">
            {bill.name}
            {bill.installmentNumber && bill.installmentTotal ? (
              <span className="text-muted-foreground"> · {bill.installmentNumber}/{bill.installmentTotal}</span>
            ) : null}
          </span>
          {isCardCharge ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CreditCardIcon className="size-3" /> {bill.creditCard?.name}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {bill.category ? (
          <Badge
            variant="outline"
            className="text-[10px]"
            style={bill.category.color ? { color: bill.category.color } : undefined}
          >
            {bill.category.name}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell
        className={`text-xs tabular-nums ${
          status === "overdue" ? "text-destructive" : status === "due-soon" ? "text-warning" : ""
        }`}
      >
        {formatDate(bill.dueDate)}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <CurrencyChip currency={bill.currency} show={bill.currency !== displayCurrency} />
          {formatMoney(bill.amount, bill.currency)}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Badge className={`border-transparent text-[10px] ${badge.className}`}>{t(badge.labelKey)}</Badge>
          {!bill.paid && !isCardCharge ? <PayBillButton bill={bill} onPaid={onPaid} /> : null}
        </div>
      </TableCell>
      <TableCell className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label={t("common.actionsFor", { name: bill.name })} />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>{t("common.edit")}</DropdownMenuItem>
            {bill.paid ? (
              <DropdownMenuItem onClick={onUnpay}>{t("bills.markUnpaid")}</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </motion.tr>
  );
}
