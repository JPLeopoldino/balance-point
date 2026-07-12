"use client";

import { Button } from "@balance-point/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@balance-point/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  BanIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  HistoryIcon,
  PencilIcon,
  Trash2Icon,
  TrendingUpIcon,
  UndoIcon,
} from "lucide-react";

import { useState } from "react";

import { CurrencyChip } from "@/components/currency-chip";
import { type MessageKey, useFormat, useT } from "@/i18n";
import type { ActivityRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { trpc } from "@/utils/trpc";

const ALL = "__all__";

const TYPE_META: Record<
  string,
  { labelKey: MessageKey; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  bill_paid: { labelKey: "activity.billPaid", icon: CheckCircle2Icon, tone: "text-success" },
  bill_unpaid: { labelKey: "activity.paymentReversed", icon: UndoIcon, tone: "text-warning" },
  bill_wont_pay: { labelKey: "activity.billWontPay", icon: BanIcon, tone: "text-muted-foreground" },
  bill_wont_pay_undone: {
    labelKey: "activity.billWontPayUndone",
    icon: UndoIcon,
    tone: "text-muted-foreground",
  },
  bill_deleted: { labelKey: "activity.billDeleted", icon: Trash2Icon, tone: "text-destructive" },
  balance_edited: { labelKey: "activity.balanceEdited", icon: PencilIcon, tone: "text-muted-foreground" },
  yield_accrued: { labelKey: "activity.yieldAccrued", icon: TrendingUpIcon, tone: "text-success" },
  transfer: { labelKey: "activity.transfer", icon: BanknoteIcon, tone: "text-muted-foreground" },
  plan_committed: { labelKey: "activity.planCommitted", icon: BanknoteIcon, tone: "text-primary" },
};

/** Activity feed (doc 09 §9.9) — rendered inside the Settings screen. */
export function ActivityFeed() {
  const t = useT();
  const { formatDateTime } = useFormat();
  const [accountId, setAccountId] = useState(ALL);
  const [type, setType] = useState(ALL);
  const accounts = useQuery(trpc.accounts.list.queryOptions());

  const feed = useInfiniteQuery(
    trpc.activity.list.infiniteQueryOptions(
      {
        limit: 50,
        accountId: accountId === ALL ? undefined : accountId,
        type: type === ALL ? undefined : (type as ActivityRow["type"]),
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );

  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex gap-2">
          <Select
            value={accountId}
            onValueChange={(v) => setAccountId((v as string) ?? ALL)}
            items={[
              { value: ALL, label: t("activity.allAccounts") },
              ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
            ]}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("activity.allAccounts")}</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => setType((v as string) ?? ALL)}
            items={[
              { value: ALL, label: t("activity.allTypes") },
              ...Object.entries(TYPE_META).map(([value, meta]) => ({
                value,
                label: t(meta.labelKey),
              })),
            ]}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("activity.allTypes")}</SelectItem>
              {Object.entries(TYPE_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {t(meta.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {feed.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>{t("activity.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("activity.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
          {items.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.transfer!;
            const Icon = meta.icon;
            const currency = item.bankAccount?.currency ?? "BRL";
            return (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className={`size-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {t(meta.labelKey)}
                    {item.bill ? ` · ${item.bill.name}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.bankAccount?.name ?? "—"} · {formatDateTime(item.occurredAt)}
                  </p>
                </div>
                {item.amount !== null ? (
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      item.amount < 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {formatMoney(item.amount, currency, { sign: true })}
                  </span>
                ) : null}
                {item.balanceAfter !== null ? (
                  <span className="hidden w-28 items-center justify-end gap-1 text-right text-[11px] text-muted-foreground tabular-nums sm:flex">
                    <CurrencyChip currency={currency} show={currency !== "BRL"} />
                    {formatMoney(item.balanceAfter, currency)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {feed.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {feed.isFetchingNextPage ? t("common.loading") : t("common.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
