"use client";

import type { Currency, Money } from "@balance-point/money";
import { FX_SCALE } from "@balance-point/money";
import { Badge } from "@balance-point/ui/components/badge";
import { Button } from "@balance-point/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@balance-point/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@balance-point/ui/components/dialog";
import { Input } from "@balance-point/ui/components/input";
import { Label } from "@balance-point/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";
import { Separator } from "@balance-point/ui/components/separator";
import { Switch } from "@balance-point/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@balance-point/ui/components/tabs";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ColorPicker, PRESET_COLORS } from "@/components/color-picker";
import { useHydrated } from "@/hooks/use-hydrated";
import { type Locale, useFormat, useLocale, useT } from "@/i18n";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CurrencySelect } from "@/components/currency-select";
import { MoneyInput } from "@/components/money-input";
import { authClient } from "@/lib/auth-client";
import type { CategoryRow, IncomeRow } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import {
  categoryMutations,
  fxMutations,
  incomeMutations,
  settingsMutations,
} from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

export default function SettingsPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "activity" ? "activity" : "general");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab((v as string) ?? "general")}>
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{t("settings.title")}</h2>
          <TabsList>
            <TabsTrigger value="general">{t("settings.tabGeneral")}</TabsTrigger>
            <TabsTrigger value="activity">{t("nav.activity")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general" className="flex flex-col gap-4">
          <ProfileSection />
          <CurrencySection />
          <PreferencesSection />
          <IncomeSection />
          <CategoriesSection />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSection() {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: session } = authClient.useSession();
  // Session data only after hydration — it can resolve mid-hydration and
  // diverge from the server-rendered (empty) markup.
  const user = hydrated ? session?.user : undefined;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("settings.profile")}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            authClient.signOut({
              fetchOptions: { onSuccess: () => router.push("/login") },
            })
          }
        >
          {t("auth.signOut")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Currency & FX rates (doc 09 §9.10) — rates are user-set, scaled by 1e6. */
function CurrencySection() {
  const t = useT();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const rates = useQuery(trpc.fx.list.queryOptions());
  const updateSettings = useMutation(settingsMutations.update());
  const setRate = useMutation(fxMutations.setRate());
  const refreshRate = useMutation(fxMutations.refresh());
  const [rateDraft, setRateDraft] = useState("");

  const usdBrl = (rates.data ?? []).find((r) => r.base === "USD" && r.quote === "BRL");

  useEffect(() => {
    if (usdBrl) setRateDraft((usdBrl.rate / FX_SCALE).toFixed(4).replace(/\.?0+$/, ""));
  }, [usdBrl]);

  const staleDays = usdBrl
    ? Math.floor((Date.now() - new Date(usdBrl.asOf).getTime()) / 86_400_000)
    : null;

  function saveDisplaySetting(key: "baseCurrency" | "displayCurrency", value: Currency) {
    updateSettings.mutate(
      { [key]: value },
      { onError: (error) => toast.error(error.message) },
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("settings.currencyTitle")}</CardTitle>
        <CardDescription>{t("settings.currencyDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t("settings.baseCurrency")}</Label>
            <CurrencySelect
              value={settings.data?.baseCurrency ?? "BRL"}
              onChange={(v) => saveDisplaySetting("baseCurrency", v)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("settings.displayCurrency")}</Label>
            <CurrencySelect
              value={settings.data?.displayCurrency ?? "BRL"}
              onChange={(v) => saveDisplaySetting("displayCurrency", v)}
            />
          </div>
        </div>
        <Separator />
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fx-usdbrl">{t("settings.usdInBrl")}</Label>
            <Input
              id="fx-usdbrl"
              inputMode="decimal"
              className="w-32 tabular-nums"
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={setRate.isPending}
            onClick={() => {
              const parsed = Number(rateDraft.replace(",", "."));
              if (!Number.isFinite(parsed) || parsed <= 0) {
                toast.error(t("settings.invalidRate"));
                return;
              }
              setRate.mutate(
                { base: "USD", quote: "BRL", rate: Math.round(parsed * FX_SCALE) },
                {
                  onSuccess: () => toast.success(t("settings.rateSaved", { rate: parsed })),
                  onError: (error) => toast.error(error.message),
                },
              );
            }}
          >
            {t("settings.saveManually")}
          </Button>
          <Button
            size="sm"
            disabled={refreshRate.isPending}
            onClick={() =>
              refreshRate.mutate(undefined, {
                onSuccess: (row) => {
                  toast.success(
                    t("settings.rateUpdated", {
                      rate: (row.rate / FX_SCALE).toFixed(4),
                      source: row.source,
                    }),
                  );
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            {refreshRate.isPending ? t("settings.updating") : t("settings.updateNow")}
          </Button>
          {usdBrl ? (
            <span className="pb-2 text-[11px] text-muted-foreground">
              {staleDays === 0
                ? t("settings.updatedToday")
                : t("settings.updatedDaysAgo", { count: staleDays ?? 0 })}
              {usdBrl.source !== "manual" ? ` · ${usdBrl.source}` : ""}
              {staleDays !== null && staleDays > 30 ? (
                <Badge className="ml-2 bg-warning/15 text-[10px] text-warning">{t("settings.stale")}</Badge>
              ) : null}
            </span>
          ) : (
            <span className="pb-2 text-[11px] text-warning">{t("settings.noRate")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PreferencesSection() {
  const t = useT();
  const { setLocale } = useLocale();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const update = useMutation(settingsMutations.update());
  const { setTheme } = useTheme();
  const [horizon, setHorizon] = useState("10");
  const [additional, setAdditional] = useState<Money | null>(0);

  useEffect(() => {
    if (settings.data) {
      setHorizon(String(settings.data.projectionHorizonMonths));
      setAdditional(settings.data.defaultAdditionalSpend);
    }
  }, [settings.data]);

  function save(input: Parameters<typeof update.mutate>[0]) {
    update.mutate(input, {
      onSuccess: () => toast.success(t("settings.preferencesSaved")),
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("settings.preferences")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="pref-horizon">{t("settings.projectionHorizon")}</Label>
          <Input
            id="pref-horizon"
            type="number"
            min={1}
            max={60}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            onBlur={() => {
              const parsed = Number(horizon);
              if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 60) {
                save({ projectionHorizonMonths: parsed });
              }
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t("settings.defaultAdditionalSpend")}</Label>
          <MoneyInput
            value={additional}
            currency={settings.data?.displayCurrency ?? "BRL"}
            onValueChange={setAdditional}
          />
          <Button
            size="xs"
            variant="outline"
            className="w-fit"
            onClick={() => save({ defaultAdditionalSpend: additional ?? 0 })}
          >
            {t("common.save")}
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Label>{t("settings.theme")}</Label>
          <Select
            value={settings.data?.theme ?? "dark"}
            onValueChange={(v) => {
              const theme = (v as "dark" | "light" | "system") ?? "dark";
              setTheme(theme);
              save({ theme });
            }}
            items={[
              { value: "dark", label: t("settings.themeDark") },
              { value: "light", label: t("settings.themeLight") },
              { value: "system", label: t("settings.themeSystem") },
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">{t("settings.themeDark")}</SelectItem>
              <SelectItem value="light">{t("settings.themeLight")}</SelectItem>
              <SelectItem value="system">{t("settings.themeSystem")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t("settings.language")}</Label>
          <Select
            value={settings.data?.locale === "en" ? "en" : "pt-BR"}
            onValueChange={(v) => {
              const locale = (v as Locale) ?? "pt-BR";
              setLocale(locale);
              save({ locale });
            }}
            items={[
              { value: "pt-BR", label: t("settings.languagePt") },
              { value: "en", label: t("settings.languageEn") },
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">{t("settings.languagePt")}</SelectItem>
              <SelectItem value="en">{t("settings.languageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

/** Baseline incomes (doc 09 §9.10) — the projection's inflow. */
function IncomeSection() {
  const t = useT();
  const incomes = useQuery(trpc.income.list.queryOptions());
  const update = useMutation(incomeMutations.update());
  const del = useMutation(incomeMutations.delete());
  const [editing, setEditing] = useState<IncomeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<IncomeRow | null>(null);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("settings.incomeTitle")}</CardTitle>
        <CardDescription>{t("settings.incomeDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {(incomes.data ?? []).map((income) => (
          <div key={income.id} className="flex items-center gap-2">
            <Switch
              checked={income.active}
              aria-label={`${income.name} active`}
              onCheckedChange={(active) =>
                update.mutate(
                  { id: income.id, active },
                  { onError: (error) => toast.error(error.message) },
                )
              }
            />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
              onClick={() => setEditing(income)}
            >
              {income.name}
            </button>
            <span className="text-xs tabular-nums">
              {formatMoney(income.amount, income.currency)}
              <span className="text-muted-foreground">{t("settings.perMonth")}</span>
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${income.name}`}
              onClick={() => setDeleting(income)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {(incomes.data ?? []).length === 0 && !incomes.isLoading ? (
          <p className="text-xs text-muted-foreground">{t("settings.noIncome")}</p>
        ) : null}
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setCreating(true)}>
          {t("settings.addIncome")}
        </Button>

        <Separator className="my-1" />
        <IncomeOverrides />
      </CardContent>

      <IncomeFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        income={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.incomeDeleteTitle", { name: deleting?.name ?? "" })}
        description={t("settings.incomeDeleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const income = deleting;
          setDeleting(null);
          del.mutate(
            { id: income.id },
            {
              onSuccess: () => toast.success(t("settings.deletedToast", { name: income.name })),
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </Card>
  );
}

/**
 * Month-specific salary overrides (doc 04 §4.8): "this September I'll earn X".
 * Stored in the display currency; the projection prefers an override over the
 * baseline income sum. Also editable inline on the Projection screen.
 */
function IncomeOverrides() {
  const t = useT();
  const { formatMonth } = useFormat();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const overrides = useQuery(trpc.income.listOverrides.queryOptions({}));
  const setOverride = useMutation(incomeMutations.setOverride());
  const clearOverride = useMutation(incomeMutations.clearOverride());
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState<Money | null>(null);

  const displayCurrency = settings.data?.displayCurrency ?? "BRL";

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-medium">{t("settings.overridesTitle")}</p>
        <p className="text-[11px] text-muted-foreground">{t("settings.overridesDescription")}</p>
      </div>

      {(overrides.data ?? []).map((override) => (
        <div key={override.id} className="flex items-center gap-2 text-xs">
          <span className="w-32 font-medium">{formatMonth(override.month)}</span>
          <span className="tabular-nums">{formatMoney(override.amount, displayCurrency)}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={t("settings.removeOverride", { month: formatMonth(override.month) })}
            onClick={() =>
              clearOverride.mutate(
                { month: override.month },
                {
                  onSuccess: () =>
                    toast.success(t("settings.overrideRemoved", { month: formatMonth(override.month) })),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {(overrides.data ?? []).length === 0 && !overrides.isLoading ? (
        <p className="text-[11px] text-muted-foreground">{t("settings.noOverrides")}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="override-month">{t("common.month")}</Label>
          <Input
            id="override-month"
            type="month"
            className="w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t("settings.amountIn", { currency: displayCurrency })}</Label>
          <MoneyInput
            value={amount}
            currency={displayCurrency}
            onValueChange={setAmount}
            className="w-36"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!/^\d{4}-\d{2}$/.test(month) || amount === null || setOverride.isPending}
          onClick={() =>
            setOverride.mutate(
              { month, amount: amount ?? 0 },
              {
                onSuccess: () => {
                  toast.success(t("settings.overrideSet", { month: formatMonth(month) }));
                  setMonth("");
                  setAmount(null);
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
        >
          {t("settings.addOverride")}
        </Button>
      </div>
    </div>
  );
}

function IncomeFormDialog({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income: IncomeRow | null;
}) {
  const t = useT();
  const isEdit = income !== null;
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<Money | null>(null);
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [dayOfMonth, setDayOfMonth] = useState("");

  useEffect(() => {
    if (open) {
      setName(income?.name ?? "");
      setAmount(income?.amount ?? null);
      setCurrency(income?.currency ?? "BRL");
      setDayOfMonth(income?.dayOfMonth ? String(income.dayOfMonth) : "");
    }
  }, [open, income]);

  const create = useMutation(incomeMutations.create());
  const update = useMutation(incomeMutations.update());

  // Optimistic submit: the list updates at once and the dialog closes;
  // a failure rolls the cache back with an error toast.
  function submit() {
    if (!name.trim() || amount === null) return;
    const trimmedName = name.trim();
    const day = dayOfMonth ? Number(dayOfMonth) : undefined;
    const callbacks = {
      onSuccess: () => toast.success(t("settings.incomeSaved", { name: trimmedName })),
      onError: (error: { message: string }) => toast.error(error.message),
    };
    if (isEdit && income) {
      update.mutate(
        { id: income.id, name: trimmedName, amount, currency, dayOfMonth: day ?? null },
        callbacks,
      );
    } else {
      create.mutate({ name: trimmedName, amount, currency, dayOfMonth: day }, callbacks);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("settings.incomeEditTitle", { name: income?.name ?? "" })
              : t("settings.incomeAddTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="inc-name">{t("common.name")}</Label>
            <Input id="inc-name" value={name} autoFocus placeholder={t("settings.salaryPlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label>{t("settings.monthlyAmount")}</Label>
              <MoneyInput value={amount} currency={currency} onValueChange={setAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.currency")}</Label>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inc-day">{t("settings.payDay")}</Label>
            <Input
              id="inc-day"
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!name.trim() || amount === null}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesSection() {
  const t = useT();
  const categories = useQuery(trpc.categories.list.queryOptions());
  const del = useMutation(categoryMutations.delete());
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("settings.categoriesTitle")}</CardTitle>
        <CardDescription>{t("settings.categoriesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {(categories.data ?? []).map((category) => (
          <div key={category.id} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: category.color ?? "var(--muted-foreground)" }}
              aria-hidden
            />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
              onClick={() => setEditing(category)}
            >
              {category.name}
            </button>
            {category.isCreditCard ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {t("settings.cardStatements")}
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${category.name}`}
              onClick={() => setDeleting(category)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setCreating(true)}>
          {t("settings.addCategory")}
        </Button>
      </CardContent>

      <CategoryFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        category={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.categoryDeleteTitle", { name: deleting?.name ?? "" })}
        description={t("settings.categoryDeleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const category = deleting;
          setDeleting(null);
          del.mutate(
            { id: category.id },
            {
              onSuccess: () => toast.success(t("settings.deletedToast", { name: category.name })),
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </Card>
  );
}

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRow | null;
}) {
  const t = useT();
  const isEdit = category !== null;
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PRESET_COLORS[0]!);
  const [isCreditCard, setIsCreditCard] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? PRESET_COLORS[0]!);
      setIsCreditCard(category?.isCreditCard ?? false);
    }
  }, [open, category]);

  const create = useMutation(categoryMutations.create());
  const update = useMutation(categoryMutations.update());

  // Optimistic submit: the list updates at once and the dialog closes;
  // a failure rolls the cache back with an error toast.
  function submit() {
    if (!name.trim()) return;
    const trimmedName = name.trim();
    const callbacks = {
      onSuccess: () => toast.success(t("settings.categorySaved", { name: trimmedName })),
      onError: (error: { message: string }) => toast.error(error.message),
    };
    if (isEdit && category) {
      update.mutate({ id: category.id, name: trimmedName, color, isCreditCard }, callbacks);
    } else {
      create.mutate({ name: trimmedName, color, isCreditCard }, callbacks);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("settings.categoryEditTitle", { name: category?.name ?? "" })
              : t("settings.categoryAddTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">{t("common.name")}</Label>
            <Input id="cat-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker value={color} onChange={(c) => setColor(c ?? PRESET_COLORS[0]!)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-xs font-medium">{t("settings.cardStatementsCategory")}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("settings.cardStatementsDescription")}
              </p>
            </div>
            <Switch checked={isCreditCard} onCheckedChange={setIsCreditCard} aria-label={t("settings.cardStatementsCategory")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
