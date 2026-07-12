"use client";

import type { Currency, Money } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@balance-point/ui/components/dialog";
import { Input } from "@balance-point/ui/components/input";
import { Label } from "@balance-point/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import { useT } from "@/i18n";
import type { RecurringRow } from "@/lib/api-types";
import { todayISO } from "@/lib/format";
import { recurringMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

const NONE = "__none__";

type Frequency = "monthly" | "every_n_months" | "manual";
type EndMode = "infinite" | "until_date" | "installments";

export interface RecurringPrefill {
  name?: string;
  amount?: Money;
  currency?: Currency;
}

/**
 * Create/edit a recurring expense (doc 09 §9.5–9.6). `kind` is fixed by the
 * calling screen: subscriptions and recurring bills are the same entity.
 */
export function RecurringFormDialog({
  open,
  onOpenChange,
  template,
  kind,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: RecurringRow | null;
  kind: "bill" | "subscription";
  prefill?: RecurringPrefill;
}) {
  const t = useT();
  const isEdit = Boolean(template);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<Money | null>(null);
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalMonths, setIntervalMonths] = useState("3");
  const [renewDay, setRenewDay] = useState("5");
  const [categoryId, setCategoryId] = useState(NONE);
  const [chargedTo, setChargedTo] = useState(NONE);
  const [endMode, setEndMode] = useState<EndMode>("infinite");
  const [endDate, setEndDate] = useState("");
  const [installmentsTotal, setInstallmentsTotal] = useState("12");
  const [startDate, setStartDate] = useState(todayISO());

  const accounts = useQuery({ ...trpc.accounts.list.queryOptions(), enabled: open });
  const cards = useQuery({ ...trpc.cards.list.queryOptions(), enabled: open });
  const categories = useQuery({ ...trpc.categories.list.queryOptions(), enabled: open });

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );
  const activeCards = useMemo(() => (cards.data ?? []).filter((c) => !c.archived), [cards.data]);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? prefill?.name ?? "");
    setAmount(template?.defaultAmount ?? prefill?.amount ?? null);
    setCurrency(template?.currency ?? prefill?.currency ?? "BRL");
    setFrequency(template?.frequency ?? "monthly");
    setIntervalMonths(String(template?.intervalMonths && template.intervalMonths > 1 ? template.intervalMonths : 3));
    setRenewDay(String(template?.renewDay ?? 5));
    setCategoryId(template?.categoryId ?? NONE);
    setChargedTo(
      template?.creditCardId
        ? `card:${template.creditCardId}`
        : template?.sourceAccountId
          ? `acc:${template.sourceAccountId}`
          : NONE,
    );
    setEndMode(template?.endMode ?? "infinite");
    setEndDate(template?.endDate ?? "");
    setInstallmentsTotal(String(template?.installmentsTotal ?? 12));
    setStartDate(template?.startDate ?? todayISO());
  }, [open, template, prefill]);

  const create = useMutation(recurringMutations.create());
  const update = useMutation(recurringMutations.update());
  const pending = create.isPending || update.isPending;

  const canSubmit =
    name.trim().length > 0 &&
    amount !== null &&
    amount > 0 &&
    Number(renewDay) >= 1 &&
    Number(renewDay) <= 31 &&
    (endMode !== "until_date" || endDate) &&
    (endMode !== "installments" || Number(installmentsTotal) >= 1);

  // Optimistic submit: the template lands in the list at once, the dialog
  // closes and a failure rolls the cache back with an error toast.
  function submit() {
    if (!canSubmit || amount === null) return;
    const sourceAccountId = chargedTo.startsWith("acc:") ? chargedTo.slice(4) : null;
    const creditCardId = chargedTo.startsWith("card:") ? chargedTo.slice(5) : null;
    const shared = {
      name: name.trim(),
      defaultAmount: amount,
      currency,
      frequency,
      intervalMonths: frequency === "every_n_months" ? Number(intervalMonths) || 3 : 1,
      renewDay: Number(renewDay),
      endMode,
      endDate: endMode === "until_date" ? endDate : undefined,
      installmentsTotal: endMode === "installments" ? Number(installmentsTotal) : undefined,
      startDate,
    };
    if (isEdit && template) {
      update.mutate(
        {
          id: template.id,
          ...shared,
          categoryId: categoryId === NONE ? null : categoryId,
          sourceAccountId,
          creditCardId,
          endDate: shared.endDate ?? null,
          installmentsTotal: shared.installmentsTotal ?? null,
        },
        {
          onSuccess: () => toast.success(t("recurringForm.updatedToast", { name: shared.name })),
          onError: (error) => toast.error(error.message),
        },
      );
    } else {
      create.mutate(
        {
          ...shared,
          kind,
          categoryId: categoryId === NONE ? undefined : categoryId,
          sourceAccountId: sourceAccountId ?? undefined,
          creditCardId: creditCardId ?? undefined,
        },
        {
          onSuccess: () => toast.success(t("recurringForm.addedToast", { name: shared.name })),
          onError: (error) => toast.error(error.message),
        },
      );
    }
    onOpenChange(false);
  }

  const chargedToItems = [
    { value: NONE, label: t("recurringForm.checkingNoDefault") },
    ...activeAccounts.map((a) => ({ value: `acc:${a.id}`, label: a.name })),
    ...activeCards.map((c) => ({ value: `card:${c.id}`, label: `💳 ${c.name}` })),
  ];
  const categoryItems = [
    { value: NONE, label: t("common.uncategorized") },
    ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("recurringForm.editTitle", { name: template?.name ?? "" })
              : kind === "subscription"
                ? t("recurringForm.addSubscription")
                : t("recurringForm.addBill")}
          </DialogTitle>
          <DialogDescription>
            {chargedTo.startsWith("card:")
              ? t("recurringForm.cardDescription")
              : t("recurringForm.billDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rec-name">{t("common.name")}</Label>
            <Input
              id="rec-name"
              value={name}
              autoFocus
              placeholder={
                kind === "subscription"
                  ? t("recurringForm.subscriptionPlaceholder")
                  : t("recurringForm.billPlaceholder")
              }
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label>{t("common.amount")}</Label>
              <MoneyInput value={amount} currency={currency} onValueChange={setAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.currency")}</Label>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>{t("recurringForm.frequency")}</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency((v as Frequency) ?? "monthly")}
                items={[
                  { value: "monthly", label: t("recurringForm.optionMonthly") },
                  { value: "every_n_months", label: t("recurringForm.optionEveryN") },
                  { value: "manual", label: t("recurringForm.optionManual") },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("recurringForm.optionMonthly")}</SelectItem>
                  <SelectItem value="every_n_months">{t("recurringForm.optionEveryN")}</SelectItem>
                  <SelectItem value="manual">{t("recurringForm.optionManual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {frequency === "every_n_months" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="rec-interval">{t("recurringForm.everyNMonthsLabel")}</Label>
                <Input
                  id="rec-interval"
                  type="number"
                  min={2}
                  max={24}
                  value={intervalMonths}
                  onChange={(e) => setIntervalMonths(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="rec-renew">{t("recurringForm.renewDay")}</Label>
                <Input
                  id="rec-renew"
                  type="number"
                  min={1}
                  max={31}
                  value={renewDay}
                  onChange={(e) => setRenewDay(e.target.value)}
                />
              </div>
            )}
          </div>

          {frequency === "every_n_months" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rec-renew2">{t("recurringForm.renewDay")}</Label>
              <Input
                id="rec-renew2"
                type="number"
                min={1}
                max={31}
                value={renewDay}
                onChange={(e) => setRenewDay(e.target.value)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>{t("common.category")}</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId((v as string) ?? NONE)}
                items={categoryItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("recurringForm.chargedTo")}</Label>
              <Select
                value={chargedTo}
                onValueChange={(v) => setChargedTo((v as string) ?? NONE)}
                items={chargedToItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("recurringForm.checkingNoDefault")}</SelectItem>
                  <SelectGroup>
                    <SelectLabel>{t("recurringForm.accountsGroup")}</SelectLabel>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={`acc:${a.id}`}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t("recurringForm.cardsGroup")}</SelectLabel>
                    {activeCards.map((c) => (
                      <SelectItem key={c.id} value={`card:${c.id}`}>
                        💳 {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rec-start">{t("recurringForm.startDate")}</Label>
              <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("recurringForm.ends")}</Label>
              <Select
                value={endMode}
                onValueChange={(v) => setEndMode((v as EndMode) ?? "infinite")}
                items={[
                  { value: "infinite", label: t("recurringForm.endsNever") },
                  { value: "until_date", label: t("recurringForm.endsUntil") },
                  { value: "installments", label: t("recurringForm.endsInstallments") },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="infinite">{t("recurringForm.endsNever")}</SelectItem>
                  <SelectItem value="until_date">{t("recurringForm.endsUntil")}</SelectItem>
                  <SelectItem value="installments">{t("recurringForm.endsInstallments")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {endMode === "until_date" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rec-end">{t("recurringForm.endDate")}</Label>
              <Input id="rec-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          ) : null}
          {endMode === "installments" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rec-installments">{t("recurringForm.installments")}</Label>
              <Input
                id="rec-installments"
                type="number"
                min={1}
                max={120}
                value={installmentsTotal}
                onChange={(e) => setInstallmentsTotal(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            {pending ? t("common.saving") : isEdit ? t("common.saveChanges") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Next charge date from frequency + renew day (doc 09 §9.5). */
export function nextChargeDate(template: RecurringRow): string | null {
  if (!template.active || template.frequency === "manual") return null;
  const step = template.frequency === "monthly" ? 1 : Math.max(1, template.intervalMonths);
  const today = todayISO();
  let month = template.startDate.slice(0, 7);
  const endMonth = template.endMode === "until_date" && template.endDate ? template.endDate.slice(0, 7) : null;
  let count = 0;
  const max =
    template.endMode === "installments" && template.installmentsTotal
      ? template.installmentsTotal
      : 600;

  const addM = (m: string, n: number) => {
    const [y, mm] = m.split("-").map(Number) as [number, number];
    const total = y * 12 + (mm - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  };
  const dateIn = (m: string, day: number) => {
    const [y, mm] = m.split("-").map(Number) as [number, number];
    const last = new Date(y, mm, 0).getDate();
    return `${m}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };

  while (count < max) {
    if (endMonth && month > endMonth) return null;
    const due = dateIn(month, template.renewDay);
    if (due >= today) return due;
    month = addM(month, step);
    count += 1;
  }
  return null;
}
