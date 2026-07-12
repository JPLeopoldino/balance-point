"use client";

import type { Currency, Money } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";
import { Card, CardContent } from "@balance-point/ui/components/card";
import { Label } from "@balance-point/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
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
import { PencilIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ProjectionChart } from "@/components/dashboard/projection-chart";
import { MoneyInput } from "@/components/money-input";
import { PageHeader } from "@/components/page-header";
import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { incomeMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

const HORIZONS = [6, 10, 12, 18, 24, 36];

export default function ProjectionPage() {
  const t = useT();
  const { formatMonthShort } = useFormat();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const [horizonOverride, setHorizonOverride] = useState<number | null>(null);
  const [includeYield, setIncludeYield] = useState(true);
  const [additionalOverrides, setAdditionalOverrides] = useState<Map<string, Money>>(new Map());

  const horizon = horizonOverride ?? settings.data?.projectionHorizonMonths ?? 10;
  const additionalSpend = useMemo(
    () => [...additionalOverrides.entries()].map(([month, amount]) => ({ month, amount })),
    [additionalOverrides],
  );

  const projection = useQuery(
    trpc.projection.get.queryOptions({
      horizonMonths: horizon,
      includeYield,
      additionalSpend: additionalSpend.length > 0 ? additionalSpend : undefined,
    }),
  );
  const overrides = useQuery(trpc.income.listOverrides.queryOptions({}));
  const overriddenMonths = useMemo(
    () => new Set((overrides.data ?? []).map((o) => o.month)),
    [overrides.data],
  );
  const setIncomeOverride = useMutation(incomeMutations.setOverride());
  const clearIncomeOverride = useMutation(incomeMutations.clearOverride());

  const data = projection.data;
  const currency: Currency = data?.displayCurrency ?? "BRL";
  const firstNegative = data?.rows.find((r) => r.projectedBalance < 0)?.month ?? null;
  const hasYield = (data?.rows ?? []).some((r) => r.yield !== 0);

  function saveIncome(month: string, amount: Money) {
    setIncomeOverride.mutate(
      { month, amount },
      {
        onSuccess: () =>
          toast.success(t("projection.incomeOverrideSet", { month: formatMonthShort(month) })),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function clearIncome(month: string) {
    clearIncomeOverride.mutate(
      { month },
      {
        onSuccess: () =>
          toast.success(t("projection.backToBaseline", { month: formatMonthShort(month) })),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("projection.title")}
        description={t("page.projectionDescription")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("projection.seededFrom")}{" "}
          <span className="font-medium text-foreground">
            {formatMoney(data?.seedFreeTotal ?? 0, currency)}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("projection.horizon")}</Label>
            <Select
              value={String(horizon)}
              onValueChange={(v) => setHorizonOverride(Number(v))}
              items={HORIZONS.map((h) => ({ value: String(h), label: t("common.monthsCount", { count: h }) }))}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORIZONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {t("common.monthsCount", { count: h })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={includeYield}
              onCheckedChange={setIncludeYield}
              aria-label={t("projection.includeYield")}
            />
            <Label className="text-xs">{t("projection.includeYield")}</Label>
          </div>
        </div>
      </div>

      {firstNegative ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t("projection.firstNegative", { month: formatMonthShort(firstNegative) })}
        </p>
      ) : null}
      {data?.warnings.map((warning) => (
        <p key={warning} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {warning}
        </p>
      ))}

      <Card size="sm">
        <CardContent>
          {projection.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ProjectionChart rows={data?.rows ?? []} currency={currency} className="h-64 w-full md:h-72" />
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.month")}</TableHead>
              <TableHead className="text-right">{t("projection.colIncome")}</TableHead>
              <TableHead className="text-right">{t("projection.colBills")}</TableHead>
              <TableHead className="text-right">{t("projection.colAdditional")}</TableHead>
              {hasYield ? <TableHead className="text-right">{t("projection.colYield")}</TableHead> : null}
              <TableHead className="text-right">{t("projection.colBalance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projection.isLoading
              ? [0, 1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={hasYield ? 6 : 5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : data?.rows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="text-xs font-medium">{formatMonthShort(row.month)}</TableCell>
                    <TableCell className="text-right">
                      <EditableMoneyCell
                        value={row.income}
                        currency={currency}
                        overridden={overriddenMonths.has(row.month)}
                        onSave={(amount) => saveIncome(row.month, amount)}
                        onClear={() => clearIncome(row.month)}
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs text-destructive tabular-nums">
                      {formatMoney(row.bills, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableMoneyCell
                        value={row.additionalSpend}
                        currency={currency}
                        onSave={(amount) =>
                          setAdditionalOverrides((prev) => new Map(prev).set(row.month, amount))
                        }
                      />
                    </TableCell>
                    {hasYield ? (
                      <TableCell className="text-right text-xs text-success tabular-nums">
                        {row.yield > 0 ? `+${formatMoney(row.yield, currency)}` : "—"}
                      </TableCell>
                    ) : null}
                    <TableCell
                      className={`text-right text-xs font-semibold tabular-nums ${
                        row.projectedBalance < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatMoney(row.projectedBalance, currency)}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("projection.footnote", { yield: hasYield ? t("projection.footnoteYield") : "" })}
      </p>
    </div>
  );
}

function EditableMoneyCell({
  value,
  currency,
  onSave,
  overridden = false,
  onClear,
}: {
  value: Money;
  currency: Currency;
  onSave: (value: Money) => void;
  /** Month has a stored override — shown as a yellow dot; onClear resets it. */
  overridden?: boolean;
  onClear?: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Money | null>(value);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <MoneyInput
          value={draft}
          currency={currency}
          onValueChange={setDraft}
          className="w-32"
          autoFocus
        />
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            if (draft !== null) onSave(draft);
            setEditing(false);
          }}
        >
          {t("common.save")}
        </Button>
        {overridden && onClear ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            title={t("projection.resetTitle")}
            onClick={() => {
              onClear();
              setEditing(false);
            }}
          >
            {t("projection.reset")}
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
          ✕
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="group inline-flex items-center gap-1 rounded-md px-1 text-xs tabular-nums hover:bg-accent"
      title={overridden ? t("projection.overriddenTitle") : undefined}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {overridden ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
      {formatMoney(value, currency)}
      <PencilIcon className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
