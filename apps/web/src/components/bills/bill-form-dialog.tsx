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
import { Textarea } from "@balance-point/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCcwIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import { useT } from "@/i18n";
import type { BillRow } from "@/lib/api-types";
import { formatMoney, todayISO } from "@/lib/format";
import { billMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

const NONE = "__none__";

interface BillFormState {
  name: string;
  amount: Money | null;
  currency: Currency;
  dueDate: string;
  categoryId: string;
  payFrom: string; // "acc:<id>" | "card:<id>" | NONE
  notes: string;
}

function initialState(bill?: BillRow | null, defaultDate?: string): BillFormState {
  return {
    name: bill?.name ?? "",
    amount: bill?.amount ?? null,
    currency: bill?.currency ?? "BRL",
    dueDate: bill?.dueDate ?? defaultDate ?? todayISO(),
    categoryId: bill?.categoryId ?? NONE,
    payFrom: bill?.creditCardId
      ? `card:${bill.creditCardId}`
      : bill?.sourceAccountId
        ? `acc:${bill.sourceAccountId}`
        : NONE,
    notes: bill?.notes ?? "",
  };
}

/**
 * Create/edit a bill (doc 09 §9.3). "Pay from" is either a bank account or
 * "charge to a card" — a card charge is settled via the card statement (§4.3).
 */
export function BillFormDialog({
  open,
  onOpenChange,
  bill,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: BillRow | null;
  defaultDate?: string;
}) {
  const router = useRouter();
  const t = useT();
  const isEdit = Boolean(bill);
  const [form, setForm] = useState<BillFormState>(() => initialState(bill, defaultDate));

  useEffect(() => {
    if (open) setForm(initialState(bill, defaultDate));
  }, [open, bill, defaultDate]);

  const accounts = useQuery({ ...trpc.accounts.list.queryOptions(), enabled: open });
  const cards = useQuery({ ...trpc.cards.list.queryOptions(), enabled: open });
  const categories = useQuery({ ...trpc.categories.list.queryOptions(), enabled: open });

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );
  const activeCards = useMemo(() => (cards.data ?? []).filter((c) => !c.archived), [cards.data]);

  const payFromItems = useMemo(
    () => [
      { value: NONE, label: t("common.none") },
      ...activeAccounts.map((a) => ({ value: `acc:${a.id}`, label: a.name })),
      ...activeCards.map((c) => ({ value: `card:${c.id}`, label: `💳 ${c.name}` })),
    ],
    [activeAccounts, activeCards],
  );
  const categoryItems = useMemo(
    () => [
      { value: NONE, label: t("common.uncategorized") },
      ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories.data, t],
  );

  const create = useMutation(billMutations.create());
  const update = useMutation(billMutations.update());
  const pending = create.isPending || update.isPending;

  const isCardCharge = form.payFrom.startsWith("card:");
  const canSubmit = form.name.trim().length > 0 && form.amount !== null && form.amount > 0;

  function refFields() {
    const sourceAccountId = form.payFrom.startsWith("acc:") ? form.payFrom.slice(4) : null;
    const creditCardId = form.payFrom.startsWith("card:") ? form.payFrom.slice(5) : null;
    return { sourceAccountId, creditCardId };
  }

  // Optimistic submit: the row lands in the table at once, the dialog closes
  // and a failure rolls the cache back with an error toast.
  function submit() {
    if (!canSubmit || form.amount === null) return;
    const { sourceAccountId, creditCardId } = refFields();
    const amount = form.amount;
    const currency = form.currency;
    const shared = {
      name: form.name.trim(),
      amount,
      currency,
      dueDate: form.dueDate,
      categoryId: form.categoryId === NONE ? null : form.categoryId,
      notes: form.notes.trim() ? form.notes.trim() : null,
    };
    if (isEdit && bill) {
      update.mutate(
        { id: bill.id, ...shared, sourceAccountId, creditCardId },
        {
          onSuccess: () => toast.success(t("billForm.updatedToast", { name: shared.name })),
          onError: (error) => toast.error(error.message),
        },
      );
    } else {
      create.mutate(
        {
          ...shared,
          categoryId: shared.categoryId ?? undefined,
          notes: shared.notes ?? undefined,
          sourceAccountId: sourceAccountId ?? undefined,
          creditCardId: creditCardId ?? undefined,
        },
        {
          onSuccess: () =>
            toast.success(
              t("billForm.addedToast", {
                name: shared.name,
                amount: formatMoney(amount, currency),
              }),
            ),
          onError: (error) => toast.error(error.message),
        },
      );
    }
    onOpenChange(false);
  }

  function selectPayFrom(value: string) {
    setForm((f) => {
      const next = { ...f, payFrom: value };
      // Default the bill's currency to the chosen source's currency.
      if (value.startsWith("acc:")) {
        const account = activeAccounts.find((a) => a.id === value.slice(4));
        if (account && !isEdit) next.currency = account.currency;
      } else if (value.startsWith("card:")) {
        const card = activeCards.find((c) => c.id === value.slice(5));
        if (card && !isEdit) next.currency = card.currency;
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("billForm.editTitle") : t("billForm.addTitle")}</DialogTitle>
          <DialogDescription>
            {isCardCharge ? t("billForm.cardChargeDescription") : t("billForm.checkingDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bill-name">{t("common.name")}</Label>
            <Input
              id="bill-name"
              value={form.name}
              autoFocus
              placeholder={t("billForm.namePlaceholder")}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bill-amount">{t("common.amount")}</Label>
              <MoneyInput
                id="bill-amount"
                value={form.amount}
                currency={form.currency}
                disabled={isEdit && bill?.paid}
                onValueChange={(amount) => setForm((f) => ({ ...f, amount }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.currency")}</Label>
              <CurrencySelect
                value={form.currency}
                disabled={isEdit && bill?.paid}
                onChange={(currency) => setForm((f) => ({ ...f, currency }))}
              />
            </div>
          </div>
          {isEdit && bill?.paid ? (
            <p className="text-xs text-muted-foreground">{t("billForm.paidHint")}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bill-due">{t("billForm.dueDate")}</Label>
              <Input
                id="bill-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.category")}</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: (v as string) ?? NONE }))}
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
          </div>

          <div className="grid gap-1.5">
            <Label>{t("billForm.payFromChargeTo")}</Label>
            <Select
              value={form.payFrom}
              onValueChange={(v) => selectPayFrom((v as string) ?? NONE)}
              items={payFromItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                <SelectGroup>
                  <SelectLabel>{t("billForm.accountsGroup")}</SelectLabel>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={`acc:${a.id}`}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{t("billForm.cardsGroup")}</SelectLabel>
                  {activeCards.map((c) => (
                    <SelectItem key={c.id} value={`card:${c.id}`}>
                      💳 {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bill-notes">{t("common.notes")}</Label>
            <Textarea
              id="bill-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {!isEdit ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                onOpenChange(false);
                const params = new URLSearchParams();
                if (form.name.trim()) params.set("name", form.name.trim());
                if (form.amount) params.set("amount", String(form.amount));
                params.set("currency", form.currency);
                router.push(`/recurring?${params.toString()}` as Route);
              }}
            >
              <RefreshCcwIcon data-icon="inline-start" /> {t("billForm.makeRecurring")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={!canSubmit || pending}>
              {pending ? t("common.saving") : isEdit ? t("common.saveChanges") : t("billForm.addTitle")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
