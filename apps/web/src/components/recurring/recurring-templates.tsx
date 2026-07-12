"use client";

import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@balance-point/ui/components/dialog";
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
import { Progress } from "@balance-point/ui/components/progress";
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
import { CreditCardIcon, MoreHorizontalIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useFormat, useT } from "@/i18n";
import { CurrencyChip } from "@/components/currency-chip";
import {
  RecurringFormDialog,
  type RecurringPrefill,
} from "@/components/recurring/recurring-form-dialog";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import type { RecurringRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { recurringMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

/**
 * Recurring-bill templates management (doc 09 §9.6), rendered as the
 * "Recurring" view inside the Bills screen — a recurring bill is still a bill.
 */
export function RecurringTemplates({ prefill }: { prefill?: RecurringPrefill }) {
  const t = useT();
  const { formatDate } = useFormat();
  const { currency: displayCurrency } = useDisplayCurrency();
  const templates = useQuery(trpc.recurring.list.queryOptions({ kind: "bill" }));
  const toggle = useMutation(recurringMutations.toggleActive());
  const del = useMutation(recurringMutations.delete());
  const generateAll = useMutation(recurringMutations.generate());

  const [creating, setCreating] = useState(() => Boolean(prefill));
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [deleting, setDeleting] = useState<RecurringRow | null>(null);
  const [previewFor, setPreviewFor] = useState<RecurringRow | null>(null);

  const rows = templates.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{t("recurring.intro")}</p>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={generateAll.isPending}
            onClick={() =>
              generateAll.mutate(
                {},
                {
                  onSuccess: (result) => {
                    toast.success(
                      result.created > 0
                        ? t("recurring.generatedToast", { count: result.created })
                        : t("recurring.nothingToGenerate"),
                    );
                  },
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            {generateAll.isPending ? t("recurring.generating") : t("recurring.generate")}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            {t("recurring.addButton")}
          </Button>
        </div>
      </div>

      {templates.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RefreshCcwIcon />
            </EmptyMedia>
            <EmptyTitle>{t("recurring.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("recurring.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreating(true)}>{t("recurring.emptyAdd")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="text-right">{t("common.amount")}</TableHead>
                <TableHead>{t("recurring.colCadence")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("recurring.colEnds")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("subscriptions.colChargedTo")}</TableHead>
                <TableHead className="w-20 text-right">{t("common.active")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className={row.active ? "" : "opacity-55"}>
                  <TableCell className="text-xs font-medium">{row.name}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <CurrencyChip currency={row.currency} show={row.currency !== displayCurrency} />
                      {formatMoney(row.defaultAmount, row.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.frequency === "monthly"
                      ? t("subscriptions.monthly")
                      : row.frequency === "manual"
                        ? t("subscriptions.manual")
                        : t("subscriptions.everyNMonths", { count: row.intervalMonths })}
                    <span className="text-muted-foreground">
                      {" "}· {t("subscriptions.day", { day: row.renewDay })}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {row.endMode === "infinite" ? (
                      <span className="text-muted-foreground">{t("recurring.never")}</span>
                    ) : row.endMode === "until_date" ? (
                      <span className="text-muted-foreground">
                        {t("recurring.untilDate", {
                          date: row.endDate ? formatDate(row.endDate, { withYear: true }) : "—",
                        })}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Progress
                          value={
                            row.installmentsTotal
                              ? Math.round(
                                  (row.installmentsGenerated / row.installmentsTotal) * 100,
                                )
                              : 0
                          }
                          className="w-16"
                          aria-label={t("recurring.installmentsProgress")}
                        />
                        <span className="text-muted-foreground tabular-nums">
                          {row.installmentsGenerated}/{row.installmentsTotal}
                        </span>
                      </span>
                    )}
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
                        <DropdownMenuItem onClick={() => setPreviewFor(row)}>
                          {t("recurring.previewGenerate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(row)}>{t("common.edit")}</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(row)}>
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
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
        kind="bill"
        prefill={prefill}
      />

      <GeneratePreviewDialog template={previewFor} onClose={() => setPreviewFor(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("recurring.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("recurring.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const template = deleting;
          setDeleting(null);
          del.mutate(
            { id: template.id, deleteFutureBills: true },
            {
              onSuccess: (result) => {
                toast.success(
                  result.deletedBills > 0
                    ? t("recurring.deletedWithBills", {
                        name: template.name,
                        count: result.deletedBills,
                      })
                    : t("recurring.deletedToast", { name: template.name }),
                );
              },
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </div>
  );
}

/** Idempotent generation preview (doc 09 §9.6): shows what would be created. */
function GeneratePreviewDialog({
  template,
  onClose,
}: {
  template: RecurringRow | null;
  onClose: () => void;
}) {
  const t = useT();
  const { formatMonth } = useFormat();
  const preview = useQuery({
    ...trpc.recurring.preview.queryOptions({ id: template?.id ?? "" }),
    enabled: template !== null,
  });
  const generate = useMutation(recurringMutations.generate());

  const rows = preview.data ?? [];
  const missing = rows.filter((r) => !r.alreadyExists);

  return (
    <Dialog open={template !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("recurring.previewTitle", { name: template?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("recurring.previewDescription")}</DialogDescription>
        </DialogHeader>
        {preview.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("recurring.previewEmpty")}</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {rows.map((row) => (
              <div
                key={row.month}
                className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0"
              >
                <span>
                  {formatMonth(row.month)}
                  {row.installmentNumber ? (
                    <span className="text-muted-foreground"> · {row.installmentNumber}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatMoney(row.amount, row.currency)}
                  {row.alreadyExists ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {t("recurring.exists")}
                    </Badge>
                  ) : (
                    <Badge className="bg-primary/15 text-[10px] text-primary">{t("recurring.new")}</Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            disabled={missing.length === 0 || generate.isPending}
            onClick={() =>
              template &&
              generate.mutate(
                { id: template.id },
                {
                  onSuccess: (result) => {
                    toast.success(t("recurring.generatedN", { count: result.created }));
                    onClose();
                  },
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            {generate.isPending
              ? t("recurring.generating")
              : t("recurring.generateN", { count: missing.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
