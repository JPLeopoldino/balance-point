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
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { Switch } from "@balance-point/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, LandmarkIcon, MoreHorizontalIcon, PencilIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ColorPicker, PRESET_COLORS } from "@/components/color-picker";
import { useT } from "@/i18n";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencyChip } from "@/components/currency-chip";
import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import type { AccountRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { invalidateMoneyData } from "@/lib/invalidate";
import { queryClient, trpc } from "@/utils/trpc";

export default function AccountsPage() {
  const t = useT();
  const accounts = useQuery(trpc.accounts.list.queryOptions());
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [creating, setCreating] = useState(false);
  const accrue = useMutation(trpc.accounts.accrueYield.mutationOptions());

  const rows = accounts.data ?? [];
  const active = rows.filter((a) => !a.archived);
  const archived = rows.filter((a) => a.archived);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{t("accounts.title")}</h2>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={accrue.isPending}
            onClick={() =>
              accrue.mutate(undefined, {
                onSuccess: (result) => {
                  if (result.accrued.length === 0) toast.info(t("accounts.noYieldDue"));
                  else toast.success(t("accounts.accruedToast", { count: result.accrued.length }));
                  invalidateMoneyData();
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            {t("accounts.accrueYield")}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            {t("accounts.addButton")}
          </Button>
        </div>
      </div>

      {accounts.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LandmarkIcon />
            </EmptyMedia>
            <EmptyTitle>{t("accounts.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("accounts.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreating(true)}>{t("accounts.emptyAdd")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((account) => (
              <AccountCard key={account.id} account={account} onEdit={() => setEditing(account)} />
            ))}
          </div>
          {archived.length > 0 ? (
            <>
              <h3 className="mt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("common.archived")}
              </h3>
              <div className="grid grid-cols-1 gap-3 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
                {archived.map((account) => (
                  <AccountCard key={account.id} account={account} onEdit={() => setEditing(account)} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      <AccountFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        account={editing}
      />
    </div>
  );
}

function AccountCard({ account, onEdit }: { account: AccountRow; onEdit: () => void }) {
  const t = useT();
  const archive = useMutation(trpc.accounts.archive.mutationOptions());
  const del = useMutation(trpc.accounts.delete.mutationOptions());
  const accountsList = useQuery(trpc.accounts.list.queryOptions());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  const otherAccounts = (accountsList.data ?? []).filter((a) => a.id !== account.id);

  function runDelete(reassignToId?: string) {
    del.mutate(
      { id: account.id, reassignToId },
      {
      onSuccess: () => {
          toast.success(t("accounts.deletedToast", { name: account.name }));
          invalidateMoneyData();
        },
        onError: (error) => {
          if (error.data?.code === "CONFLICT") {
            setReassignOpen(true);
          } else {
            toast.error(error.message);
          }
        },
      },
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: account.color ?? "var(--primary)" }}
            aria-hidden
          />
          <span className="truncate">{account.name}</span>
          <CurrencyChip currency={account.currency} />
        </CardTitle>
        {account.institution ? (
          <p className="text-xs text-muted-foreground">{account.institution}</p>
        ) : null}
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label={t("common.actionsFor", { name: account.name })} />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>{t("accounts.editAndYield")}</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  archive.mutate(
                    { id: account.id, archived: !account.archived },
                    {
                      onSuccess: () => {
                        toast.success(
                          account.archived ? t("accounts.unarchivedToast") : t("accounts.archivedToast"),
                        );
                        invalidateMoneyData();
                      },
                    },
                  )
                }
              >
                {account.archived ? t("common.unarchive") : t("common.archive")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <InlineBalance
          label={t("common.checking")}
          account={account}
          field="checking"
          value={account.checkingBalance}
        />
        <InlineBalance
          label={t("common.invested")}
          account={account}
          field="investment"
          value={account.investmentBalance}
        />
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("accounts.deleteTitle", { name: account.name })}
        description={t("accounts.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          runDelete();
        }}
      />

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("accounts.reassignTitle")}</DialogTitle>
            <DialogDescription>
              {t("accounts.reassignDescription", { name: account.name })}
            </DialogDescription>
          </DialogHeader>
          <Select
            value={reassignTo}
            onValueChange={(v) => setReassignTo((v as string) ?? "")}
            items={otherAccounts.map((a) => ({ value: a.id, label: a.name }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("payBill.chooseAccount")} />
            </SelectTrigger>
            <SelectContent>
              {otherAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!reassignTo || del.isPending}
              onClick={() => {
                setReassignOpen(false);
                runDelete(reassignTo);
              }}
            >
              {t("accounts.reassignConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Inline balance edit — mirrors typing straight into the sheet (doc 09 §9.4). */
function InlineBalance({
  label,
  account,
  field,
  value,
}: {
  label: string;
  account: AccountRow;
  field: "checking" | "investment";
  value: Money;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Money | null>(value);
  const update = useMutation(trpc.accounts.updateBalance.mutationOptions());

  function save() {
    if (draft === null || draft === value) {
      setEditing(false);
      return;
    }
    update.mutate(
      { id: account.id, field, amount: draft },
      {
        onSuccess: () => {
          toast.success(
            t("accounts.balanceUpdated", { label, amount: formatMoney(value, account.currency) }),
          );
          setEditing(false);
          invalidateMoneyData();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {editing ? (
        <span className="flex items-center gap-1">
          <MoneyInput
            value={draft}
            currency={account.currency}
            onValueChange={setDraft}
            className="w-36"
            autoFocus
          />
          <Button size="icon-xs" variant="ghost" aria-label={t("accounts.saveBalance")} onClick={save} disabled={update.isPending}>
            <CheckIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t("common.cancel")}
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            <XIcon />
          </Button>
        </span>
      ) : (
        <button
          type="button"
          className="group flex items-center gap-1.5 rounded-md px-1 text-sm font-medium tabular-nums hover:bg-accent"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          {formatMoney(value, account.currency)}
          <PencilIcon className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
}

function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRow | null;
}) {
  const t = useT();
  const isEdit = account !== null;
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [checking, setChecking] = useState<Money | null>(0);
  const [investment, setInvestment] = useState<Money | null>(0);
  const [color, setColor] = useState<string>(PRESET_COLORS[0]!);

  // Yield config (doc 09 §9.4) — loaded for existing accounts.
  const yieldQuery = useQuery({
    ...trpc.accounts.getYield.queryOptions({ bankAccountId: account?.id ?? "" }),
    enabled: open && isEdit,
  });
  const [yieldEnabled, setYieldEnabled] = useState(false);
  const [ratePct, setRatePct] = useState("");
  const [ratePeriod, setRatePeriod] = useState<"annual" | "monthly">("annual");

  useEffect(() => {
    if (open) {
      setName(account?.name ?? "");
      setInstitution(account?.institution ?? "");
      setCurrency(account?.currency ?? "BRL");
      setChecking(account?.checkingBalance ?? 0);
      setInvestment(account?.investmentBalance ?? 0);
      setColor(account?.color ?? PRESET_COLORS[0]!);
    }
  }, [open, account]);

  useEffect(() => {
    if (yieldQuery.data) {
      setYieldEnabled(yieldQuery.data.enabled);
      setRatePct((yieldQuery.data.rateBps / 100).toString());
      setRatePeriod(yieldQuery.data.ratePeriod);
    } else if (open) {
      setYieldEnabled(false);
      setRatePct("");
      setRatePeriod("annual");
    }
  }, [yieldQuery.data, open]);

  const create = useMutation(trpc.accounts.create.mutationOptions());
  const update = useMutation(trpc.accounts.update.mutationOptions());
  const setYield = useMutation(trpc.accounts.setYield.mutationOptions());

  const rateBps = Math.round(Number(ratePct.replace(",", ".")) * 100);
  const monthlyPreview =
    isEdit && yieldEnabled && Number.isFinite(rateBps) && rateBps > 0 && account
      ? Math.round(
          (account.investmentBalance * rateBps) / (ratePeriod === "monthly" ? 10_000 : 10_000 * 12),
        )
      : null;

  async function submit() {
    if (!name.trim()) return;
    try {
      if (isEdit && account) {
        await update.mutateAsync({
          id: account.id,
          name: name.trim(),
          institution: institution.trim() || null,
          currency,
          color,
        });
        if (yieldQuery.data || yieldEnabled) {
          await setYield.mutateAsync({
            bankAccountId: account.id,
            enabled: yieldEnabled,
            rateBps: Number.isFinite(rateBps) && rateBps > 0 ? rateBps : 0,
            ratePeriod,
          });
        }
        toast.success(t("accounts.updatedToast", { name: name.trim() }));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          institution: institution.trim() || undefined,
          currency,
          checkingBalance: checking ?? 0,
          investmentBalance: investment ?? 0,
          color,
        });
        toast.success(t("accounts.addedToast", { name: name.trim() }));
      }
      void queryClient.invalidateQueries({ queryKey: trpc.accounts.pathKey() });
      invalidateMoneyData();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("accounts.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("accounts.editTitle", { name: account?.name ?? "" }) : t("accounts.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("accounts.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-name">{t("common.name")}</Label>
              <Input id="acc-name" value={name} autoFocus placeholder="Nubank" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.currency")}</Label>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-inst">{t("accounts.institution")}</Label>
            <Input id="acc-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>

          {!isEdit ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>{t("accounts.checkingBalance")}</Label>
                <MoneyInput value={checking} currency={currency} onValueChange={setChecking} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("accounts.investmentBalance")}</Label>
                <MoneyInput value={investment} currency={currency} onValueChange={setInvestment} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker value={color} onChange={(c) => setColor(c ?? PRESET_COLORS[0]!)} />
          </div>

          {isEdit ? (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{t("accounts.yieldTitle")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("accounts.yieldDescription")}</p>
                </div>
                <Switch checked={yieldEnabled} onCheckedChange={setYieldEnabled} aria-label={t("accounts.enableYield")} />
              </div>
              {yieldEnabled ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="acc-rate">{t("accounts.ratePct")}</Label>
                    <Input
                      id="acc-rate"
                      inputMode="decimal"
                      placeholder={ratePeriod === "monthly" ? "1.05" : "13.75"}
                      className="w-24"
                      value={ratePct}
                      onChange={(e) => setRatePct(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("accounts.quotedPer")}</Label>
                    <Select
                      value={ratePeriod}
                      onValueChange={(v) => setRatePeriod((v as "annual" | "monthly") ?? "annual")}
                      items={[
                        { value: "annual", label: t("accounts.perYear") },
                        { value: "monthly", label: t("accounts.perMonth") },
                      ]}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">{t("accounts.perYear")}</SelectItem>
                        <SelectItem value="monthly">{t("accounts.perMonth")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="pb-2 text-[11px] text-muted-foreground tabular-nums">
                    {monthlyPreview !== null
                      ? t("accounts.nextAccrual", {
                          amount: formatMoney(monthlyPreview, account!.currency),
                        })
                      : "—"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending || update.isPending}>
            {isEdit ? t("common.saveChanges") : t("accounts.addTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
