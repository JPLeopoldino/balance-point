"use client";

import type { Currency, Money } from "@balance-point/money";
import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@balance-point/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@balance-point/ui/components/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@balance-point/ui/components/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import { PageHeader } from "@/components/page-header";
import { PlanSimulationChart } from "@/components/plans/plan-simulation-chart";
import { useFormat, useT } from "@/i18n";
import type { PlanRow } from "@/lib/api-types";
import { formatMoney, todayISO } from "@/lib/format";
import { planMutations } from "@/lib/mutations";
import { withCallbacks } from "@/lib/optimistic";
import { trpc } from "@/utils/trpc";

type Mode = "lump_sum" | "installments";

export default function PlansPage() {
  const t = useT();
  const { formatMonth } = useFormat();
  const plans = useQuery(trpc.plans.list.queryOptions());
  const accounts = useQuery(trpc.accounts.list.queryOptions());
  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  );

  // Simulator state (doc 09 §9.8) — either an existing plan or ad-hoc inputs.
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<Money | null>(null);
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [mode, setMode] = useState<Mode>("installments");
  const [installments, setInstallments] = useState("12");
  const [startDate, setStartDate] = useState(todayISO());
  const [sourceAccountId, setSourceAccountId] = useState("");

  const selectedPlan = (plans.data ?? []).find((p) => p.id === selectedPlanId) ?? null;

  const simulateInput = selectedPlan
    ? { id: selectedPlan.id }
    : amount !== null && amount > 0 && sourceAccountId
      ? {
          name,
          totalAmount: amount,
          currency,
          mode,
          installments: mode === "installments" ? Number(installments) || 12 : undefined,
          startDate,
          sourceAccountId,
        }
      : null;

  const simulation = useQuery({
    ...trpc.plans.simulate.queryOptions(simulateInput ?? { id: "" }),
    enabled: simulateInput !== null,
  });

  const createPlan = useMutation(planMutations.create());
  const commitPlan = useMutation(planMutations.commit());
  const [confirmCommit, setConfirmCommit] = useState(false);

  const sim = simulation.data;
  const verdict = !sim
    ? null
    : !sim.affordable
      ? { label: t("plans.notAffordable"), className: "bg-destructive/15 text-destructive" }
      : sim.minBalance < Math.round((selectedPlan?.totalAmount ?? amount ?? 0) / 10)
        ? { label: t("plans.tight"), className: "bg-warning/15 text-warning" }
        : { label: t("plans.affordable"), className: "bg-success/15 text-success" };

  const commitCount =
    selectedPlan?.mode === "installments" ? (selectedPlan.installments ?? 1) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("plans.title")} description={t("page.plansDescription")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Plans list */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("plans.savedPlans")}
            </h3>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setSelectedPlanId(null)}
              disabled={selectedPlanId === null}
            >
              {t("plans.newSimulation")}
            </Button>
          </div>
          {plans.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (plans.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              {t("plans.emptyList")}
            </p>
          ) : (
            (plans.data ?? []).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={plan.id === selectedPlanId}
                onSelect={() => setSelectedPlanId(plan.id)}
              />
            ))
          )}
        </div>

        {/* Simulator */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("plans.simulator")}
              {verdict ? (
                <Badge className={`border-transparent text-[10px] ${verdict.className}`}>
                  {verdict.label}
                </Badge>
              ) : null}
            </CardTitle>
            {selectedPlan ? (
              <p className="text-xs text-muted-foreground">
                {t("plans.planMeta", {
                  name: selectedPlan.name,
                  amount: formatMoney(selectedPlan.totalAmount, selectedPlan.currency),
                  mode:
                    selectedPlan.mode === "installments"
                      ? t("plans.modeInstallments", { count: selectedPlan.installments ?? 0 })
                      : t("plans.modeLump"),
                  account: selectedPlan.sourceAccount?.name ?? "—",
                  month: formatMonth(selectedPlan.startDate.slice(0, 7)),
                })}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!selectedPlan ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-name">{t("common.name")}</Label>
                  <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("plans.total")}</Label>
                  <MoneyInput value={amount} currency={currency} onValueChange={setAmount} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("common.currency")}</Label>
                  <CurrencySelect value={currency} onChange={setCurrency} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("plans.mode")}</Label>
                  <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <TabsList className="w-full">
                      <TabsTrigger value="lump_sum">{t("plans.lump")}</TabsTrigger>
                      <TabsTrigger value="installments">{t("plans.installments")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {mode === "installments" ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="plan-inst">{t("plans.installments")}</Label>
                    <Input
                      id="plan-inst"
                      type="number"
                      min={2}
                      max={120}
                      value={installments}
                      onChange={(e) => setInstallments(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-start">{t("plans.start")}</Label>
                  <Input
                    id="plan-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("plans.fromAccount")}</Label>
                  <Select
                    value={sourceAccountId || null}
                    onValueChange={(v) => setSourceAccountId((v as string) ?? "")}
                    items={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("plans.chooseAccount")} />
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
              </div>
            ) : null}

            {simulateInput === null ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                {t("plans.fillPrompt")}
              </p>
            ) : simulation.isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : sim ? (
              <>
                <PlanSimulationChart rows={sim.rows} currency={sim.displayCurrency} />
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
                  <span>
                    {t("plans.minBalance")}{" "}
                    <span className={sim.minBalance < 0 ? "font-medium text-destructive" : "font-medium"}>
                      {formatMoney(sim.minBalance, sim.displayCurrency)}
                    </span>
                  </span>
                  {sim.firstNegativeMonth ? (
                    <span className="text-destructive">
                      {t("plans.firstNegative", { month: formatMonth(sim.firstNegativeMonth) })}
                    </span>
                  ) : (
                    <span className="text-success">{t("plans.neverNegative")}</span>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  {!selectedPlan ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={createPlan.isPending || !simulateInput}
                      onClick={() =>
                        createPlan.mutate(
                          {
                            name,
                            totalAmount: amount!,
                            currency,
                            mode,
                            installments: mode === "installments" ? Number(installments) || 12 : undefined,
                            startDate,
                            sourceAccountId,
                          },
                          {
                            onSuccess: (plan) => {
                              toast.success(t("plans.savedToast", { name: plan.name }));
                              setSelectedPlanId(plan.id);
                            },
                            onError: (error) => toast.error(error.message),
                          },
                        )
                      }
                    >
                      {t("plans.saveAsPlan")}
                    </Button>
                  ) : selectedPlan.status === "draft" ? (
                    <Button size="sm" onClick={() => setConfirmCommit(true)} disabled={commitPlan.isPending}>
                      {t("plans.commitPlan")}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {t("plans.committedBadge")}
                    </Badge>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmCommit}
        onOpenChange={setConfirmCommit}
        title={t("plans.commitTitle", { name: selectedPlan?.name ?? "" })}
        description={t("plans.commitDescription", { count: commitCount })}
        confirmLabel={t("plans.commitConfirm", { count: commitCount })}
        onConfirm={() => {
          setConfirmCommit(false);
          if (!selectedPlan) return;
          commitPlan.mutate(
            { id: selectedPlan.id },
            {
              onSuccess: (result) => {
                toast.success(
                  t("plans.committedToast", {
                    name: result.plan.name,
                    count: result.bills.length,
                  }),
                );
              },
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const { formatDate } = useFormat();
  // Hook-level callbacks: the optimistic patch removes this card from the
  // list, which unmounts it before the server answers.
  const del = useMutation(
    withCallbacks(planMutations.delete(), {
      onSuccess: () => toast.success(t("plans.deletedToast", { name: plan.name })),
      onError: (error) => toast.error(error.message),
    }),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card
      size="sm"
      className={`cursor-pointer transition-colors ${selected ? "ring-primary/60" : "hover:ring-foreground/20"}`}
      onClick={onSelect}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs">
          {plan.name}
          <Badge
            className={`border-transparent text-[10px] ${
              plan.status === "committed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {plan.status === "committed" ? t("plans.statusCommitted") : t("plans.statusDraft")}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("plans.cardMeta", {
            amount: formatMoney(plan.totalAmount, plan.currency),
            mode:
              plan.mode === "installments"
                ? ` · ${plan.installments}×`
                : ` ·${t("plans.modeLump")}`,
            account: plan.sourceAccount?.name ?? "—",
            date: formatDate(plan.startDate, { withYear: true }),
          })}
        </p>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label={t("common.actionsFor", { name: plan.name })} />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("plans.deleteTitle", { name: plan.name })}
        description={
          plan.status === "committed"
            ? t("plans.deleteCommittedDescription")
            : t("plans.deleteDraftDescription")
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          del.mutate({ id: plan.id });
        }}
      />
    </Card>
  );
}
