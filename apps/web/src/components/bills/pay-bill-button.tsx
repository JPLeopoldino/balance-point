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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { invalidateMoneyData } from "@/lib/invalidate";
import { trpc } from "@/utils/trpc";

export interface PayableBill {
  id: string;
  name: string;
  amount: Money;
  currency: Currency;
  sourceAccountId: string | null;
}

/**
 * Pay action shared by the dashboard and the Bills table. A bill without a
 * source account can't be paid blindly (doc 04 §4.5) — this opens an account
 * picker instead of failing with "Choose an account to pay from".
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const pay = useMutation(trpc.bills.pay.mutationOptions());
  const accounts = useQuery({ ...trpc.accounts.list.queryOptions(), enabled: pickerOpen });
  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );

  function doPay(fromAccountId?: string) {
    pay.mutate(
      { id: bill.id, fromAccountId },
      {
        onSuccess: (result) => {
          toast.success(
            t("bills.paidToast", {
              name: result.bill.name,
              amount: formatMoney(result.bill.amount, result.bill.currency),
            }),
            { description: result.warning },
          );
          setPickerOpen(false);
          invalidateMoneyData();
          onPaid?.();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={pay.isPending}
        onClick={() => {
          if (bill.sourceAccountId) doPay();
          else setPickerOpen(true);
        }}
      >
        {pay.isPending ? t("payBill.paying") : t("payBill.pay")}
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payBill.dialogTitle", { name: bill.name })}</DialogTitle>
            <DialogDescription>
              {t("payBill.dialogDescription", {
                amount: formatMoney(bill.amount, bill.currency),
              })}
            </DialogDescription>
          </DialogHeader>
          <Select
            value={accountId || null}
            onValueChange={(v) => setAccountId((v as string) ?? "")}
            items={activeAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${formatMoney(a.checkingBalance, a.currency)}`,
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("payBill.chooseAccount")} />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.checkingBalance, a.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!accountId || pay.isPending} onClick={() => doPay(accountId)}>
              {pay.isPending ? t("payBill.paying") : t("payBill.pay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
