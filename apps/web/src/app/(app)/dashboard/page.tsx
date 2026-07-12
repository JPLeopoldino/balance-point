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
import { LandmarkIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BillFormDialog } from "@/components/bills/bill-form-dialog";
import { PayBillButton } from "@/components/bills/pay-bill-button";
import { CurrencyChip } from "@/components/currency-chip";
import { ProjectionChart } from "@/components/dashboard/projection-chart";
import {
  AccountRowsSkeleton,
  CardsStripSkeleton,
  ChartSkeleton,
  UpcomingBillsSkeleton,
} from "@/components/dashboard/skeletons";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Stagger, StaggerItem } from "@/components/stagger";
import { useFormat, useT } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export default function DashboardPage() {
  const t = useT();
  const { formatDate } = useFormat();
  const [addBillOpen, setAddBillOpen] = useState(false);
  const summary = useQuery(trpc.dashboard.summary.queryOptions());
  const year = Number(
    (summary.data?.currentMonth ?? new Date().getFullYear().toString()).slice(0, 4),
  );
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
    <div className="flex flex-col gap-6">
      {/* Phone only: on desktop the rail already carries "Add bill", and two of
          the same primary action on one screen just competes with itself. */}
      <PageHeader title={t("nav.dashboard")} description={t("page.dashboardDescription")}>
        <Button className="md:hidden" onClick={() => setAddBillOpen(true)}>
          <PlusIcon data-icon="inline-start" /> {t("nav.addBill")}
        </Button>
      </PageHeader>

      {/*
       * One <Stagger/> for the whole screen: the cards fade+rise in a single
       * wave on mount — skeletons and all — and then fill in as each query
       * lands. Nothing re-animates on data arrival, so there's no second,
       * competing entrance and no layout shift.
       */}
      <Stagger className="flex flex-col gap-4">
        {s?.warnings.map((warning) => (
          <StaggerItem key={warning}>
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {warning}
            </p>
          </StaggerItem>
        ))}

        {/* Top KPI row (doc 09 §9.2) */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StaggerItem>
            <KpiCard
              label={t("dashboard.totalMoney")}
              value={s?.totalMoney ?? 0}
              currency={currency}
              emphasis
              loading={loading}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              label={t("dashboard.wallet")}
              value={s?.wallet ?? 0}
              currency={currency}
              loading={loading}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              label={t("dashboard.invested")}
              value={s?.invested ?? 0}
              currency={currency}
              loading={loading}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              label={t("dashboard.totalCredit")}
              value={s?.totalCredit ?? 0}
              currency={currency}
              loading={loading}
              sublabel={t("dashboard.freeAcrossCards")}
            />
          </StaggerItem>
        </section>

        {/* Month bills + Free (remaining is the KPI — doc 04 §4.4) */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StaggerItem>
            <Card size="sm" className="h-full">
              <CardHeader>
                <CardTitle className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t("dashboard.monthBills")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {loading ? (
                  <>
                    <Skeleton className="my-0.5 h-7 w-32" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-36" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                    <Skeleton className="h-3 w-28" />
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-semibold tabular-nums">
                      {formatMoney(s?.monthBills ?? 0, currency)}
                    </span>
                    <Progress
                      value={paidProgress}
                      aria-label={t("dashboard.paidProgress", { pct: paidProgress })}
                    />
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
                      {t("dashboard.nextMonth", {
                        amount: formatMoney(s?.nextMonthBills ?? 0, currency),
                      })}
                    </span>
                  </>
                )}
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <KpiCard
              label={t("dashboard.freeMonth")}
              value={s?.freeMonth ?? 0}
              currency={currency}
              loading={loading}
              sublabel={
                <>
                  {t("dashboard.afterNextMonth")}{" "}
                  <span
                    className={`tabular-nums ${(s?.freeMonthNext ?? 0) < 0 ? "text-destructive" : ""}`}
                  >
                    {formatMoney(s?.freeMonthNext ?? 0, currency)}
                  </span>
                </>
              }
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              label={t("dashboard.freeTotal")}
              value={s?.freeTotal ?? 0}
              currency={currency}
              loading={loading}
              sublabel={
                <>
                  {t("dashboard.afterNextMonth")}{" "}
                  <span
                    className={`tabular-nums ${(s?.freeTotalNext ?? 0) < 0 ? "text-destructive" : ""}`}
                  >
                    {formatMoney(s?.freeTotalNext ?? 0, currency)}
                  </span>
                </>
              }
            />
          </StaggerItem>
        </section>

        {/* Accounts + next bill */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <StaggerItem className="lg:col-span-2">
            <Card size="sm" className="h-full">
              <CardHeader>
                <CardTitle>{t("dashboard.accounts")}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <AccountRowsSkeleton />
                ) : (
                  <>
                    <div className="flex flex-col divide-y divide-border">
                      {s?.accounts.map((account) => (
                        <Link
                          key={account.id}
                          href="/accounts"
                          className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/40"
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
                    </div>
                    <div className="flex justify-between pt-2 text-[10px] tracking-wide text-muted-foreground uppercase">
                      <span>{t("dashboard.accountColumn")}</span>
                      <span>{t("dashboard.balancesColumn")}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card size="sm" className="h-full">
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
                  <UpcomingBillsSkeleton />
                ) : s && s.upcomingBills.length > 0 ? (
                  <div className="flex flex-col divide-y divide-border">
                    {s.upcomingBills.map(({ bill, daysUntil }) => (
                      <div
                        key={bill.id}
                        className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                      >
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
          </StaggerItem>
        </section>

        {/* Cards strip (free credit per card — doc 09 §9.2) */}
        {loading || (s && s.cards.length > 0) ? (
          <StaggerItem>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("dashboard.cardsFreeCredit")}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <CardsStripSkeleton />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {s?.cards.map((card) => {
                      const usedPct =
                        card.limit > 0
                          ? Math.min(100, Math.round((card.used / card.limit) * 100))
                          : 0;
                      return (
                        <Link key={card.id} href="/cards" className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: card.color ?? "var(--primary)" }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {card.name}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {t("dashboard.freeAmount", {
                                amount: formatMoney(card.available, card.currency),
                              })}
                            </span>
                          </div>
                          <Progress
                            value={usedPct}
                            aria-label={t("dashboard.usedPct", { name: card.name, pct: usedPct })}
                          />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        ) : null}

        {/* Charts (doc 08 §8.7) */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <StaggerItem>
            <Card size="sm" className="h-full">
              <CardHeader>
                <CardTitle>{t("dashboard.spendingByMonth", { year })}</CardTitle>
              </CardHeader>
              <CardContent>
                {monthSummary.isLoading ? (
                  <ChartSkeleton />
                ) : (
                  <SpendingChart data={monthSummary.data ?? []} currency={currency} />
                )}
              </CardContent>
            </Card>
          </StaggerItem>
          <StaggerItem>
            <Card size="sm" className="h-full">
              <CardHeader>
                <CardTitle>
                  {t("dashboard.projection")} ·{" "}
                  <Link
                    href="/projection"
                    className="text-xs font-normal text-primary hover:underline"
                  >
                    {t("dashboard.open")}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {projection.isLoading ? (
                  <ChartSkeleton bars={10} />
                ) : (
                  <ProjectionChart rows={projection.data?.rows ?? []} currency={currency} />
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        </section>
      </Stagger>

      <BillFormDialog open={addBillOpen} onOpenChange={setAddBillOpen} />
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
