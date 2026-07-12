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
import { Label } from "@balance-point/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MoneyInput } from "@/components/money-input";
import { useT } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { invalidateMoneyData } from "@/lib/invalidate";
import { trpc } from "@/utils/trpc";

const NO_BANK = "__none__";

export interface PayableBill {
  id: string;
  name: string;
  amount: Money;
  currency: Currency;
  sourceAccountId: string | null;
}

/**
 * Pay action shared by the dashboard and the Bills table. Opens a small
 * confirmation dialog where the payment can come from any account — or from
 * no bank at all — and an optional discount replaces the bill's value.
 */
export function PayBillButton({
  bill,
  size = "xs",
  variant = "outline",
  onPaid,
}: {
  bill: PayableBill;
  size?: "xs" | "sm";
  variant?: "outline" | "default";
  onPaid?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>(bill.sourceAccountId ?? NO_BANK);
  const [discounted, setDiscounted] = useState<Money | null>(null);
  const pay = useMutation(trpc.bills.pay.mutationOptions());
  const accounts = useQuery({ ...trpc.accounts.list.queryOptions(), enabled: open });
  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );

  useEffect(() => {
    if (open) {
      setAccountId(bill.sourceAccountId ?? NO_BANK);
      setDiscounted(null);
    }
  }, [open, bill]);

  const finalAmount = discounted !== null && discounted > 0 ? discounted : bill.amount;

  function doPay() {
    pay.mutate(
      {
        id: bill.id,
        fromAccountId: accountId === NO_BANK ? undefined : accountId,
        withoutAccount: accountId === NO_BANK ? true : undefined,
        amount: discounted !== null && discounted > 0 && discounted !== bill.amount
          ? discounted
          : undefined,
      },
      {
        onSuccess: (result) => {
          toast.success(
            t("bills.paidToast", {
              name: result.bill.name,
              amount: formatMoney(result.bill.amount, result.bill.currency),
            }),
            { description: result.warning },
          );
          setOpen(false);
          invalidateMoneyData();
          onPaid?.();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const accountItems = [
    { value: NO_BANK, label: t("payBill.noBank") },
    ...activeAccounts.map((a) => ({
      value: a.id,
      label: `${a.name} · ${formatMoney(a.checkingBalance, a.currency)}`,
    })),
  ];

  return (
    <>
      <Button size={size} variant={variant} disabled={pay.isPending} onClick={() => setOpen(true)}>
        {pay.isPending ? t("payBill.paying") : t("payBill.pay")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payBill.dialogTitle", { name: bill.name })}</DialogTitle>
            <DialogDescription>
              {t("payBill.dialogDescription", {
                amount: formatMoney(bill.amount, bill.currency),
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("payBill.payFrom")}</Label>
              <Select
                value={accountId}
                onValueChange={(v) => setAccountId((v as string) ?? NO_BANK)}
                items={accountItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("payBill.chooseAccount")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BANK}>{t("payBill.noBank")}</SelectItem>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {formatMoney(a.checkingBalance, a.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pay-discount">{t("payBill.discountLabel")}</Label>
              <MoneyInput
                id="pay-discount"
                value={discounted}
                currency={bill.currency}
                onValueChange={setDiscounted}
              />
              <p className="text-[11px] text-muted-foreground">{t("payBill.discountHint")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={pay.isPending} onClick={doPay}>
              {pay.isPending
                ? t("payBill.paying")
                : t("payBill.payAmount", {
                    amount: formatMoney(finalAmount, bill.currency),
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
