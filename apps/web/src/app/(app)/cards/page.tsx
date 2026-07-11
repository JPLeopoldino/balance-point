"use client";

import type { Currency, Money } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@balance-point/ui/components/card";
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
import { Input } from "@balance-point/ui/components/input";
import { Label } from "@balance-point/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { Progress } from "@balance-point/ui/components/progress";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCardIcon, MoreHorizontalIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
import { useT } from "@/i18n";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencyChip } from "@/components/currency-chip";
import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import type { CardRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { invalidateMoneyData } from "@/lib/invalidate";
import { trpc } from "@/utils/trpc";

export default function CardsPage() {
  const t = useT();
  const usage = useQuery(trpc.cards.usage.queryOptions());
  const cards = useQuery(trpc.cards.list.queryOptions());
  const recurring = useQuery(trpc.recurring.list.queryOptions());
  const cardCharges = useQuery(trpc.bills.list.queryOptions({ paid: false }));
  const [editing, setEditing] = useState<CardRow | null>(null);
  const [creating, setCreating] = useState(false);

  const u = usage.data;
  const cardList = cards.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t("cards.title")}</h2>
        {u ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("cards.header", {
              available: formatMoney(u.totalCreditAvailable, u.displayCurrency),
              used: formatMoney(u.totalUsed, u.displayCurrency),
              limit: formatMoney(u.totalLimit, u.displayCurrency),
            })}
          </span>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          {t("cards.addButton")}
        </Button>
      </div>

      {u?.warnings.map((warning) => (
        <p key={warning} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {warning}
        </p>
      ))}

      {usage.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : (u?.cards.length ?? 0) === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CreditCardIcon />
            </EmptyMedia>
            <EmptyTitle>{t("cards.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("cards.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreating(true)}>{t("cards.emptyAdd")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {u?.cards.map((cardUsage) => {
            const card = cardList.find((c) => c.id === cardUsage.id);
            const usedPct =
              cardUsage.limit > 0
                ? Math.min(100, Math.round((cardUsage.used / cardUsage.limit) * 100))
                : 0;
            const charges = (recurring.data ?? []).filter(
              (r) => r.creditCardId === cardUsage.id && r.active,
            );
            const openBills = (cardCharges.data ?? []).filter(
              (b) => b.creditCardId === cardUsage.id,
            );
            return (
              <Card key={cardUsage.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCardIcon
                      className={`size-4 ${cardUsage.color ? "" : "text-muted-foreground"}`}
                      style={cardUsage.color ? { color: cardUsage.color } : undefined}
                    />
                    <span className="truncate">{cardUsage.name}</span>
                    <CurrencyChip currency={cardUsage.currency} />
                  </CardTitle>
                  {card?.bankAccount ? (
                    <p className="text-xs text-muted-foreground">
                      {t("cards.onAccount", { name: card.bankAccount.name })}
                    </p>
                  ) : null}
                  {card ? (
                    <CardAction>
                      <CardMenu card={card} />
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      {t("cards.limit", { amount: formatMoney(cardUsage.limit, cardUsage.currency) })}
                    </span>
                    <span className="text-muted-foreground">
                      {t("cards.used", { amount: formatMoney(cardUsage.used, cardUsage.currency) })}
                    </span>
                  </div>
                  <Progress value={usedPct} aria-label={t("cards.usedPctAria", { pct: usedPct })} />
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`text-lg font-semibold tabular-nums ${cardUsage.available < 0 ? "text-destructive" : ""}`}
                    >
                      {t("cards.free", {
                        amount: formatMoney(cardUsage.available, cardUsage.currency),
                      })}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {t("cards.committedPerMonth", {
                        amount: formatMoney(cardUsage.committedMonthly, cardUsage.currency),
                      })}
                    </span>
                  </div>
                  {charges.length > 0 || openBills.length > 0 ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("cards.charges", {
                        list: [...charges.map((c) => c.name), ...openBills.map((b) => b.name)].join(", "),
                      })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">{t("cards.noCharges")}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CardFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        card={editing}
      />
    </div>
  );
}

function CardMenu({ card }: { card: CardRow }) {
  const t = useT();
  const archive = useMutation(trpc.cards.archive.mutationOptions());
  const del = useMutation(trpc.cards.delete.mutationOptions());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label={t("common.actionsFor", { name: card.name })} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditingOpen(true)}>{t("common.edit")}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              archive.mutate(
                { id: card.id, archived: !card.archived },
                {
                  onSuccess: () => {
                    toast.success(
                      card.archived ? t("accounts.unarchivedToast") : t("common.archived"),
                    );
                    invalidateMoneyData();
                  },
                },
              )
            }
          >
            {card.archived ? t("common.unarchive") : t("common.archive")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("cards.deleteTitle", { name: card.name })}
        description={t("cards.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          del.mutate(
            { id: card.id },
            {
              onSuccess: () => {
                toast.success(t("cards.deletedToast", { name: card.name }));
                invalidateMoneyData();
              },
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />

      <CardFormDialog open={editingOpen} onOpenChange={setEditingOpen} card={card} />
    </>
  );
}

function CardFormDialog({
  open,
  onOpenChange,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CardRow | null;
}) {
  const t = useT();
  const isEdit = card !== null;
  const accounts = useQuery({ ...trpc.accounts.list.queryOptions(), enabled: open });
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [limit, setLimit] = useState<Money | null>(null);
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [color, setColor] = useState<string | null>(null); // null = inherit host account's

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );

  useEffect(() => {
    if (open) {
      setName(card?.name ?? "");
      setBrand(card?.brand ?? "");
      setBankAccountId(card?.bankAccountId ?? "");
      setLimit(card?.creditLimit ?? null);
      setCurrency(card?.currency ?? "BRL");
      setClosingDay(card?.closingDay ? String(card.closingDay) : "");
      setDueDay(card?.dueDay ? String(card.dueDay) : "");
      setColor(card?.color ?? null);
    }
  }, [open, card]);

  const create = useMutation(trpc.cards.create.mutationOptions());
  const update = useMutation(trpc.cards.update.mutationOptions());
  const canSubmit = name.trim().length > 0 && bankAccountId && limit !== null && limit > 0;

  async function submit() {
    if (!canSubmit || limit === null) return;
    const dayFields = {
      closingDay: closingDay ? Number(closingDay) : undefined,
      dueDay: dueDay ? Number(dueDay) : undefined,
    };
    try {
      if (isEdit && card) {
        await update.mutateAsync({
          id: card.id,
          name: name.trim(),
          brand: brand.trim() || null,
          bankAccountId,
          creditLimit: limit,
          currency,
          closingDay: dayFields.closingDay ?? null,
          dueDay: dayFields.dueDay ?? null,
          color,
        });
        toast.success(t("cards.updatedToast", { name: name.trim() }));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          brand: brand.trim() || undefined,
          bankAccountId,
          creditLimit: limit,
          currency,
          color: color ?? undefined,
          ...dayFields,
        });
        toast.success(t("cards.addedToast", { name: name.trim() }));
      }
      invalidateMoneyData();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("cards.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("cards.editTitle", { name: card?.name ?? "" }) : t("cards.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("cards.formDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="card-name">{t("common.name")}</Label>
              <Input id="card-name" value={name} autoFocus placeholder="Nubank Ultravioleta" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.currency")}</Label>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>{t("cards.hostAccount")}</Label>
              <Select
                value={bankAccountId || null}
                onValueChange={(v) => setBankAccountId((v as string) ?? "")}
                items={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("cards.chooseAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("cards.creditLimit")}</Label>
              <MoneyInput value={limit} currency={currency} onValueChange={setLimit} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="card-brand">{t("cards.brand")}</Label>
              <Input id="card-brand" value={brand} placeholder="Visa" onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-closing">{t("cards.closingDay")}</Label>
              <Input id="card-closing" type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-due">{t("cards.dueDay")}</Label>
              <Input id="card-due" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker
              value={color}
              onChange={setColor}
              allowInherit
              inheritLabel={t("cards.inheritColor")}
            />
            <p className="text-[11px] text-muted-foreground">{t("cards.colorHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || create.isPending || update.isPending}>
            {isEdit ? t("common.saveChanges") : t("cards.addTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
