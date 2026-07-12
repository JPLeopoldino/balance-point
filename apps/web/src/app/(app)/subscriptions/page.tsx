"use client";

import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
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
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { Switch } from "@balance-point/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@balance-point/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCardIcon, MoreHorizontalIcon, RepeatIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useFormat, useT } from "@/i18n";
import { CurrencyChip } from "@/components/currency-chip";
import {
  RecurringFormDialog,
  nextChargeDate,
} from "@/components/recurring/recurring-form-dialog";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import type { RecurringRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { recurringMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

export default function SubscriptionsPage() {
  const t = useT();
  const { formatDate } = useFormat();
  const { currency: displayCurrency } = useDisplayCurrency();
  const frequencyLabel = (r: RecurringRow) =>
    r.frequency === "monthly"
      ? t("subscriptions.monthly")
      : r.frequency === "manual"
        ? t("subscriptions.manual")
        : t("subscriptions.everyNMonths", { count: r.intervalMonths });
  const subs = useQuery(trpc.recurring.list.queryOptions({ kind: "subscription" }));
  const totals = useQuery(trpc.recurring.subscriptionTotals.queryOptions());
  const toggle = useMutation(recurringMutations.toggleActive());
  const del = useMutation(recurringMutations.delete());
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RecurringRow | null>(null);

  const rows = subs.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t("subscriptions.title")}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("subscriptions.header", {
            monthly: formatMoney(totals.data?.subsMonthly ?? 0, displayCurrency),
            onCards: formatMoney(totals.data?.monthlyCreditCost ?? 0, displayCurrency),
          })}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          {t("subscriptions.addButton")}
        </Button>
      </div>

      {subs.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RepeatIcon />
            </EmptyMedia>
            <EmptyTitle>{t("subscriptions.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("subscriptions.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreating(true)}>{t("subscriptions.emptyAdd")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="text-right">{t("subscriptions.colValue")}</TableHead>
                <TableHead>{t("subscriptions.colFrequency")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("subscriptions.colChargedTo")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("subscriptions.colNextCharge")}</TableHead>
                <TableHead className="w-20 text-right">{t("common.active")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const next = nextChargeDate(row);
                return (
                  <TableRow key={row.id} className={row.active ? "" : "opacity-55"}>
                    <TableCell className="text-xs font-medium">{row.name}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <CurrencyChip currency={row.currency} show={row.currency !== displayCurrency} />
                        {formatMoney(row.defaultAmount, row.currency)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {frequencyLabel(row)}
                      <span className="text-muted-foreground">
                        {" "}· {t("subscriptions.day", { day: row.renewDay })}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {row.creditCard ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <CreditCardIcon className="size-3" /> {row.creditCard.name}
                        </Badge>
                      ) : row.sourceAccount ? (
                        <span className="text-muted-foreground">{row.sourceAccount.name}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("subscriptions.checking")}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground tabular-nums md:table-cell">
                      {next ? formatDate(next) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={row.active}
                        aria-label={t("subscriptions.activeAria", { name: row.name })}
                        onCheckedChange={(active) =>
                          toggle.mutate(
                            { id: row.id, active },
                            { onError: (error) => toast.error(error.message) },
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="w-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-xs" aria-label={t("common.actionsFor", { name: row.name })} />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(row)}>{t("common.edit")}</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(row)}>
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <RecurringFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        template={editing}
        kind="subscription"
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("subscriptions.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("subscriptions.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const sub = deleting;
          setDeleting(null);
          del.mutate(
            { id: sub.id, deleteFutureBills: false },
            {
              onSuccess: () => toast.success(t("subscriptions.deletedToast", { name: sub.name })),
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </div>
  );
}
