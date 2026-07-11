"use client";

import { Button } from "@balance-point/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@balance-point/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@balance-point/ui/components/empty";
import { Progress } from "@balance-point/ui/components/progress";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { LandmarkIcon } from "lucide-react";
import Link from "next/link";

import { PayBillButton } from "@/components/bills/pay-bill-button";
import { CurrencyChip } from "@/components/currency-chip";
import { ProjectionChart } from "@/components/dashboard/projection-chart";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { KpiCard } from "@/components/kpi-card";
import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export default function DashboardPage() {
  const t = useT();
  const { formatDate } = useFormat();
  const summary = useQuery(trpc.dashboard.summary.queryOptions());
  const year = Number((summary.data?.currentMonth ?? new Date().getFullYear().toString()).slice(0, 4));
  const monthSummary = useQuery(trpc.bills.monthSummary.queryOptions({ year }));
  const projection = useQuery(trpc.projection.get.queryOptions({}));

  const s = summary.data;
  const currency = s?.displayCurrency ?? "BRL";
  const loading = summary.isLoading;

  if (!loading && s && s.accounts.length === 0) {
    return <FirstRunNudge />;
  }

  const paidProgress =
    s && s.monthBillsTotal > 0 ? Math.round((s.monthBillsPaid / s.monthBillsTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {s?.warnings.map((warning) => (
        <p key={warning} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {warning}
        </p>
      ))}

      {/* Top KPI row (doc 09 §9.2) */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("dashboard.totalMoney")} value={s?.totalMoney ?? 0} currency={currency} index={0} emphasis loading={loading} />
        <KpiCard label={t("dashboard.wallet")} value={s?.wallet ?? 0} currency={currency} index={1} loading={loading} />
        <KpiCard label={t("dashboard.invested")} value={s?.invested ?? 0} currency={currency} index={2} loading={loading} />
        <KpiCard
          label={t("dashboard.totalCredit")}
          value={s?.totalCredit ?? 0}
          currency={currency}
          index={3}
          loading={loading}
          sublabel={t("dashboard.freeAcrossCards")}
        />
      </section>

      {/* Month bills + Free (remaining is the KPI — doc 04 §4.4) */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("dashboard.monthBills")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(s?.monthBills ?? 0, currency)}
              </span>
            )}
            <Progress value={paidProgress} aria-label={t("dashboard.paidProgress", { pct: paidProgress })} />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                {t("dashboard.paidOf", {
                  paid: formatMoney(s?.monthBillsPaid ?? 0, currency),
                  total: formatMoney(s?.monthBillsTotal ?? 0, currency),
                })}
              </span>
              <span>{paidProgress}%</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("dashboard.nextMonth", { amount: formatMoney(s?.nextMonthBills ?? 0, currency) })}
            </span>
          </CardContent>
        </Card>

        <KpiCard
          label={t("dashboard.freeMonth")}
          value={s?.freeMonth ?? 0}
          currency={currency}
          index={1}
          loading={loading}
          sublabel={
            <>{t("dashboard.afterNextMonth")} <span className={`tabular-nums ${(s?.freeMonthNext ?? 0) < 0 ? "text-destructive" : ""}`}>{formatMoney(s?.freeMonthNext ?? 0, currency)}</span></>
          }
        />
        <KpiCard
          label={t("dashboard.freeTotal")}
          value={s?.freeTotal ?? 0}
          currency={currency}
          index={2}
          loading={loading}
          sublabel={
            <>{t("dashboard.afterNextMonth")} <span className={`tabular-nums ${(s?.freeTotalNext ?? 0) < 0 ? "text-destructive" : ""}`}>{formatMoney(s?.freeTotalNext ?? 0, currency)}</span></>
          }
        />
      </section>

      {/* Accounts + next bill */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card size="sm" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.accounts")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-9 w-full" />)
              : s?.accounts.map((account) => (
                  <Link
                    key={account.id}
                    href="/accounts"
                    className="flex items-center gap-2.5 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: account.color ?? "var(--primary)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {account.name}
                    </span>
                    <CurrencyChip currency={account.currency} />
                    <span className="text-xs tabular-nums">
                      {formatMoney(account.checking, account.currency)}
                    </span>
                    <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                      {formatMoney(account.investment, account.currency)}
                    </span>
                  </Link>
                ))}
            {!loading && (
              <div className="flex justify-between pt-2 text-[10px] tracking-wide text-muted-foreground uppercase">
                <span>{t("dashboard.accountColumn")}</span>
                <span>{t("dashboard.balancesColumn")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t("dashboard.nextBills")}
              <Link
                href="/bills?filter=unpaid"
                className="text-xs font-normal text-primary hover:underline"
              >
                {t("common.seeAll")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : s && s.upcomingBills.length > 0 ? (
              <div className="flex flex-col divide-y divide-border">
                {s.upcomingBills.map(({ bill, daysUntil }) => (
                  <div key={bill.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{bill.name}</p>
                      <p
                        className={`text-[11px] ${
                          daysUntil < 0
                            ? "text-destructive"
                            : daysUntil <= 7
                              ? "text-warning"
                              : "text-muted-foreground"
                        }`}
                      >
                        {formatDate(bill.dueDate)} ·{" "}
                        {daysUntil < 0
                          ? t("dashboard.overdueDays", { count: Math.abs(daysUntil) })
                          : daysUntil === 0
                            ? t("dashboard.dueToday")
                            : t("dashboard.dueInDays", { count: daysUntil })}
                      </p>
                    </div>
                    <span className="text-xs font-medium tabular-nums">
                      {formatMoney(bill.amount, bill.currency)}
                    </span>
                    <PayBillButton bill={bill} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("dashboard.noUnpaid")}</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Cards strip (free credit per card — doc 09 §9.2) */}
      {s && s.cards.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("dashboard.cardsFreeCredit")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.cards.map((card) => {
              const usedPct =
                card.limit > 0 ? Math.min(100, Math.round((card.used / card.limit) * 100)) : 0;
              return (
                <Link key={card.id} href="/cards" className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: card.color ?? "var(--primary)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{card.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {t("dashboard.freeAmount", { amount: formatMoney(card.available, card.currency) })}
                    </span>
                  </div>
                  <Progress value={usedPct} aria-label={t("dashboard.usedPct", { name: card.name, pct: usedPct })} />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Charts (doc 08 §8.7) */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("dashboard.spendingByMonth", { year })}</CardTitle>
          </CardHeader>
          <CardContent>
            {monthSummary.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <SpendingChart data={monthSummary.data ?? []} currency={currency} />
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              {t("dashboard.projection")} ·{" "}
              <Link href="/projection" className="text-xs font-normal text-primary hover:underline">
                {t("dashboard.open")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projection.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ProjectionChart rows={projection.data?.rows ?? []} currency={currency} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** First-run onboarding nudge (doc 09 §9.11). */
function FirstRunNudge() {
  const t = useT();
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LandmarkIcon />
        </EmptyMedia>
        <EmptyTitle>{t("dashboard.welcome")}</EmptyTitle>
        <EmptyDescription>{t("dashboard.welcomeDescription")}</EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/accounts">
          <Button>{t("dashboard.step1")}</Button>
        </Link>
        <Link href="/bills">
          <Button variant="outline">{t("dashboard.step2")}</Button>
        </Link>
        <Link href="/projection">
          <Button variant="outline">{t("dashboard.step3")}</Button>
        </Link>
      </div>
    </Empty>
  );
}
