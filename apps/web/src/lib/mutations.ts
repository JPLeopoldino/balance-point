import type { QueryKey } from "@tanstack/react-query";

import type {
  AccountRow,
  BillRow,
  CardRow,
  CardUsageRow,
  CategoryRow,
  DashboardSummary,
  IncomeRow,
  PlanRow,
  RecurringRow,
  RouterInputs,
  RouterOutputs,
} from "@/lib/api-types";
import { todayISO } from "@/lib/format";
import {
  applyOptimistic,
  defined,
  invalidateOnSettle,
  moneyKeys,
  patchQueries,
  rollback,
  type Snapshot,
  tempId,
} from "@/lib/optimistic";
import { queryClient, trpc } from "@/utils/trpc";

/**
 * Mutation options for every write in the app, wired for optimistic UI:
 * predictable outcomes (toggles, edits, deletes, inserts) patch the affected
 * list caches instantly and roll back on error; server-computed outcomes
 * (generate, accrue, fx refresh…) only refetch on settle. Call sites keep
 * their own `mutate(vars, { onSuccess, onError })` for toasts and dialogs.
 */

type BillListInput = RouterInputs["bills"]["list"];
type RecurringListInput = RouterInputs["recurring"]["list"];
type OverridesInput = RouterInputs["income"]["listOverrides"];
type OverrideRow = RouterOutputs["income"]["listOverrides"][number];
type CardUsage = RouterOutputs["cards"]["usage"];
type Settings = RouterOutputs["settings"]["get"];
type FxRow = RouterOutputs["fx"]["list"][number];

/* ------------------------------- helpers -------------------------------- */

/**
 * Patch rows of every cached list under `pathKey`. `patch` returns the same
 * reference to keep a row, a new object to replace it, or `null` to drop it;
 * `keep` re-applies the query's own filter to changed rows so a row that no
 * longer matches (e.g. now-paid under an unpaid filter) disappears at once.
 */
function patchList<TRow, TInput = undefined>(
  pathKey: QueryKey,
  patch: (row: TRow) => TRow | null,
  keep?: (row: TRow, input: TInput) => boolean,
): Snapshot {
  return patchQueries<TRow[], TInput>(pathKey, (rows, input) => {
    let changed = false;
    const next: TRow[] = [];
    for (const row of rows) {
      const patched = patch(row);
      if (patched === row) {
        next.push(row);
        continue;
      }
      changed = true;
      if (patched && (keep ? keep(patched, input) : true)) next.push(patched);
    }
    return changed ? next : rows;
  });
}

function insertIntoList<TRow, TInput = undefined>(
  pathKey: QueryKey,
  row: TRow,
  opts: {
    matches?: (input: TInput) => boolean;
    /** Index to insert at; defaults to appending. Return -1 to append. */
    position?: (rows: TRow[]) => number;
  } = {},
): Snapshot {
  return patchQueries<TRow[], TInput>(pathKey, (rows, input) => {
    if (opts.matches && !opts.matches(input)) return rows;
    const at = opts.position ? opts.position(rows) : -1;
    return at < 0 ? [...rows, row] : [...rows.slice(0, at), row, ...rows.slice(at)];
  });
}

/** Relation stubs resolved from already-cached lists (best effort — refetch corrects). */
function accountRef(id: string | null | undefined) {
  if (!id) return null;
  const account = queryClient
    .getQueryData<AccountRow[]>(trpc.accounts.list.queryKey())
    ?.find((a) => a.id === id);
  return account ? { id: account.id, name: account.name, currency: account.currency } : null;
}

function cardRef(id: string | null | undefined) {
  if (!id) return null;
  const card = queryClient
    .getQueryData<CardRow[]>(trpc.cards.list.queryKey())
    ?.find((c) => c.id === id);
  return card ? { id: card.id, name: card.name, currency: card.currency } : null;
}

function categoryRow(id: string | null | undefined) {
  if (!id) return null;
  return (
    queryClient
      .getQueryData<CategoryRow[]>(trpc.categories.list.queryKey())
      ?.find((c) => c.id === id) ?? null
  );
}

function billCategoryRef(id: string | null | undefined): BillRow["category"] {
  const category = categoryRow(id);
  return category
    ? {
        id: category.id,
        name: category.name,
        color: category.color,
        isCreditCard: category.isCreditCard,
      }
    : null;
}

function recurringCategoryRef(id: string | null | undefined): RecurringRow["category"] {
  const category = categoryRow(id);
  return category ? { id: category.id, name: category.name, color: category.color } : null;
}

/* --------------------------------- bills -------------------------------- */

function clientMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Client mirror of the bills.list where-clause (packages/api routers/bills.ts). */
function matchesBillFilter(row: BillRow, input: BillListInput): boolean {
  const useRange = Boolean(input?.from ?? input?.to);
  const month = useRange || input?.allTime ? undefined : (input?.month ?? clientMonth());
  if (month && row.month !== month) return false;
  if (input?.from && row.dueDate < input.from) return false;
  if (input?.to && row.dueDate > input.to) return false;
  if (input?.paid !== undefined && row.paid !== input.paid) return false;
  if (input?.wontPay !== undefined && row.wontPay !== input.wontPay) return false;
  if (input?.categoryId && row.categoryId !== input.categoryId) return false;
  if (input?.accountId && row.sourceAccountId !== input.accountId) return false;
  if (input?.creditCardId && row.creditCardId !== input.creditCardId) return false;
  if (input?.search && !row.name.toLowerCase().includes(input.search.toLowerCase())) return false;
  return true;
}

function patchBillLists(patch: (row: BillRow) => BillRow | null): Snapshot {
  return patchList<BillRow, BillListInput>(trpc.bills.list.pathKey(), patch, matchesBillFilter);
}

/** Paying/deleting a bill also pulls it out of the dashboard's "upcoming" strip. */
function dropFromDashboard(ids: ReadonlySet<string>): Snapshot {
  return patchQueries<DashboardSummary>(trpc.dashboard.summary.pathKey(), (summary) => {
    const upcomingBills = summary.upcomingBills.filter((u) => !ids.has(u.bill.id));
    if (upcomingBills.length === summary.upcomingBills.length) return summary;
    return { ...summary, upcomingBills, nextBill: upcomingBills[0] ?? null };
  });
}

function markPaid(row: BillRow, fromAccountId: string | undefined): BillRow {
  return {
    ...row,
    paid: true,
    paidAt: new Date().toISOString(),
    paidFromAccountId: fromAccountId ?? row.sourceAccountId,
  };
}

export const billMutations = {
  create: () =>
    trpc.bills.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey()], () => {
          const now = new Date().toISOString();
          const sourceAccount = accountRef(vars.sourceAccountId);
          const creditCard = cardRef(vars.creditCardId);
          const row: BillRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            amount: vars.amount,
            currency: vars.currency ?? creditCard?.currency ?? sourceAccount?.currency ?? "BRL",
            dueDate: vars.dueDate,
            month: vars.dueDate.slice(0, 7),
            paid: false,
            wontPay: false,
            paidAt: null,
            paidFromAccountId: null,
            paidFxRate: null,
            sourceAccountId: vars.sourceAccountId ?? null,
            creditCardId: vars.creditCardId ?? null,
            categoryId: vars.categoryId ?? null,
            recurringExpenseId: null,
            purchasePlanId: null,
            installmentNumber: null,
            installmentTotal: null,
            notes: vars.notes ?? null,
            createdAt: now,
            updatedAt: now,
            category: billCategoryRef(vars.categoryId),
            sourceAccount,
            creditCard,
          };
          return insertIntoList<BillRow, BillListInput>(trpc.bills.list.pathKey(), row, {
            matches: (input) => matchesBillFilter(row, input),
            position: (rows) => rows.findIndex((r) => r.dueDate > row.dueDate),
          });
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  update: () =>
    trpc.bills.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey()], () =>
          patchBillLists((row) => {
            if (row.id !== vars.id) return row;
            const next: BillRow = { ...row, ...defined(vars) };
            if (vars.dueDate) next.month = vars.dueDate.slice(0, 7);
            if (vars.categoryId !== undefined) next.category = billCategoryRef(vars.categoryId);
            if (vars.sourceAccountId !== undefined)
              next.sourceAccount = accountRef(vars.sourceAccountId);
            if (vars.creditCardId !== undefined) next.creditCard = cardRef(vars.creditCardId);
            return next;
          }),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  delete: () =>
    trpc.bills.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey(), trpc.dashboard.pathKey()], () => [
          ...patchBillLists((row) => (row.id === vars.id ? null : row)),
          ...dropFromDashboard(new Set([vars.id])),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  pay: () =>
    trpc.bills.pay.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey(), trpc.dashboard.pathKey()], () => [
          ...patchBillLists((row) =>
            row.id === vars.id ? markPaid(row, vars.fromAccountId) : row,
          ),
          ...dropFromDashboard(new Set([vars.id])),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  unpay: () =>
    trpc.bills.unpay.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey()], () =>
          patchBillLists((row) =>
            row.id === vars.id
              ? { ...row, paid: false, paidAt: null, paidFromAccountId: null, paidFxRate: null }
              : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  bulkPay: () =>
    trpc.bills.bulkPay.mutationOptions({
      onMutate: (vars) => {
        const ids = new Set(vars.ids);
        return applyOptimistic([trpc.bills.list.pathKey(), trpc.dashboard.pathKey()], () => [
          // Mirror payBillTx's skip rules: paid/won't-pay/card charges are left alone.
          ...patchBillLists((row) =>
            ids.has(row.id) && !row.paid && !row.wontPay && !row.creditCardId
              ? markPaid(row, vars.fromAccountId)
              : row,
          ),
          ...dropFromDashboard(ids),
        ]);
      },
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  setWontPay: () =>
    trpc.bills.setWontPay.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.bills.list.pathKey(), trpc.dashboard.pathKey()], () => [
          ...patchBillLists((row) =>
            row.id === vars.id ? { ...row, wontPay: vars.wontPay } : row,
          ),
          ...(vars.wontPay ? dropFromDashboard(new Set([vars.id])) : []),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),
};

/* ------------------------------- recurring ------------------------------ */

function patchRecurringLists(patch: (row: RecurringRow) => RecurringRow | null): Snapshot {
  return patchList<RecurringRow, RecurringListInput>(
    trpc.recurring.list.pathKey(),
    patch,
    (row, input) => !input?.kind || row.kind === input.kind,
  );
}

export const recurringMutations = {
  create: () =>
    trpc.recurring.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.recurring.list.pathKey()], () => {
          const now = new Date().toISOString();
          const row: RecurringRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            defaultAmount: vars.defaultAmount,
            currency: vars.currency ?? "BRL",
            kind: vars.kind ?? "bill",
            categoryId: vars.categoryId ?? null,
            sourceAccountId: vars.sourceAccountId ?? null,
            creditCardId: vars.creditCardId ?? null,
            frequency: vars.frequency ?? "monthly",
            intervalMonths: vars.intervalMonths ?? 1,
            renewDay: vars.renewDay,
            endMode: vars.endMode ?? "infinite",
            endDate: vars.endDate ?? null,
            installmentsTotal: vars.installmentsTotal ?? null,
            installmentsGenerated: 0,
            startDate: vars.startDate,
            active: true,
            createdAt: now,
            updatedAt: now,
            category: recurringCategoryRef(vars.categoryId),
            sourceAccount: accountRef(vars.sourceAccountId),
            creditCard: cardRef(vars.creditCardId),
          };
          return insertIntoList<RecurringRow, RecurringListInput>(
            trpc.recurring.list.pathKey(),
            row,
            {
              matches: (input) => !input?.kind || row.kind === input.kind,
              position: (rows) => rows.findIndex((r) => r.name.localeCompare(row.name) > 0),
            },
          );
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  update: () =>
    trpc.recurring.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.recurring.list.pathKey()], () =>
          patchRecurringLists((row) => {
            if (row.id !== vars.id) return row;
            const next: RecurringRow = { ...row, ...defined(vars) };
            if (vars.categoryId !== undefined)
              next.category = recurringCategoryRef(vars.categoryId);
            if (vars.sourceAccountId !== undefined)
              next.sourceAccount = accountRef(vars.sourceAccountId);
            if (vars.creditCardId !== undefined) next.creditCard = cardRef(vars.creditCardId);
            return next;
          }),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  toggleActive: () =>
    trpc.recurring.toggleActive.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.recurring.list.pathKey()], () =>
          patchRecurringLists((row) =>
            row.id === vars.id ? { ...row, active: vars.active } : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  delete: () =>
    trpc.recurring.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.recurring.list.pathKey(), trpc.bills.list.pathKey()], () => {
          const today = todayISO();
          return [
            ...patchRecurringLists((row) => (row.id === vars.id ? null : row)),
            // Mirror the server: future unpaid generated bills go with the template.
            ...(vars.deleteFutureBills
              ? patchBillLists((row) =>
                  row.recurringExpenseId === vars.id && !row.paid && row.dueDate >= today
                    ? null
                    : row,
                )
              : []),
          ];
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  /** Server decides what gets generated — nothing to predict client-side. */
  generate: () =>
    trpc.recurring.generate.mutationOptions({
      onSettled: invalidateOnSettle(moneyKeys()),
    }),
};

/* -------------------------------- accounts ------------------------------ */

function patchAccountList(patch: (row: AccountRow) => AccountRow | null): Snapshot {
  return patchList<AccountRow>(trpc.accounts.list.pathKey(), patch);
}

export const accountMutations = {
  create: () =>
    trpc.accounts.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.accounts.list.pathKey()], () => {
          const now = new Date().toISOString();
          const row: AccountRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            institution: vars.institution ?? null,
            checkingBalance: vars.checkingBalance ?? 0,
            investmentBalance: vars.investmentBalance ?? 0,
            currency: vars.currency ?? "BRL",
            color: vars.color ?? null,
            icon: vars.icon ?? null,
            archived: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          };
          return insertIntoList<AccountRow>(trpc.accounts.list.pathKey(), row, {
            position: (rows) => rows.findIndex((r) => r.archived),
          });
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  update: () =>
    trpc.accounts.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.accounts.list.pathKey()], () =>
          patchAccountList((row) => (row.id === vars.id ? { ...row, ...defined(vars) } : row)),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  updateBalance: () =>
    trpc.accounts.updateBalance.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.accounts.list.pathKey()], () =>
          patchAccountList((row) =>
            row.id === vars.id
              ? vars.field === "checking"
                ? { ...row, checkingBalance: vars.amount }
                : { ...row, investmentBalance: vars.amount }
              : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  archive: () =>
    trpc.accounts.archive.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.accounts.list.pathKey()], () =>
          patchAccountList((row) =>
            row.id === vars.id ? { ...row, archived: vars.archived } : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  // Deliberately NOT optimistic: deleting often CONFLICTs (bills/templates
  // still reference the account) and the caller then opens a reassign dialog —
  // an optimistic removal would unmount that card and lose the dialog.
  delete: () =>
    trpc.accounts.delete.mutationOptions({
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  setYield: () =>
    trpc.accounts.setYield.mutationOptions({
      onSettled: invalidateOnSettle([trpc.accounts.pathKey(), trpc.projection.pathKey()]),
    }),

  /** Server-computed accrual amounts — nothing to predict client-side. */
  accrueYield: () =>
    trpc.accounts.accrueYield.mutationOptions({
      onSettled: invalidateOnSettle(moneyKeys()),
    }),
};

/* --------------------------------- cards -------------------------------- */

function patchCardList(patch: (row: CardRow) => CardRow | null): Snapshot {
  return patchList<CardRow>(trpc.cards.list.pathKey(), patch);
}

function patchCardUsage(patch: (usage: CardUsage) => CardUsage): Snapshot {
  return patchQueries<CardUsage>(trpc.cards.usage.pathKey(), patch);
}

function dropUsageCard(usage: CardUsage, id: string): CardUsage {
  const cards = usage.cards.filter((c) => c.id !== id);
  // Totals are left as-is on purpose — they need FX conversion and settle on refetch.
  return cards.length === usage.cards.length ? usage : { ...usage, cards };
}

export const cardMutations = {
  create: () =>
    trpc.cards.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.cards.pathKey()], () => {
          const now = new Date().toISOString();
          const account =
            accountRef(vars.bankAccountId) ??
            // Host account not cached — a placeholder ref keeps the shape; refetch corrects it.
            { id: vars.bankAccountId, name: "", currency: vars.currency ?? ("BRL" as const) };
          const row: CardRow = {
            id: tempId(),
            userId: "",
            bankAccountId: vars.bankAccountId,
            name: vars.name,
            brand: vars.brand ?? null,
            creditLimit: vars.creditLimit,
            currency: vars.currency ?? "BRL",
            closingDay: vars.closingDay ?? null,
            dueDay: vars.dueDay ?? null,
            color: vars.color ?? null,
            icon: vars.icon ?? null,
            archived: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
            bankAccount: account,
          };
          const usageCard: CardUsageRow = {
            id: row.id,
            name: row.name,
            bankAccountId: row.bankAccountId,
            accountName: account.name,
            color: row.color,
            currency: row.currency,
            limit: row.creditLimit,
            committedMonthly: 0,
            openCharges: 0,
            used: 0,
            available: row.creditLimit,
            availableInDisplay: row.creditLimit,
          };
          return [
            ...insertIntoList<CardRow>(trpc.cards.list.pathKey(), row),
            ...patchCardUsage((usage) => ({ ...usage, cards: [...usage.cards, usageCard] })),
          ];
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  update: () =>
    trpc.cards.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.cards.pathKey()], () => [
          ...patchCardList((row) => {
            if (row.id !== vars.id) return row;
            const next: CardRow = { ...row, ...defined(vars) };
            if (vars.bankAccountId !== undefined)
              next.bankAccount = accountRef(vars.bankAccountId) ?? {
                id: vars.bankAccountId,
                name: "",
                currency: next.currency,
              };
            return next;
          }),
          ...patchCardUsage((usage) => ({
            ...usage,
            cards: usage.cards.map((c) => {
              if (c.id !== vars.id) return c;
              const limit = vars.creditLimit ?? c.limit;
              return {
                ...c,
                name: vars.name ?? c.name,
                currency: vars.currency ?? c.currency,
                color: vars.color === undefined ? c.color : vars.color,
                limit,
                available: limit - c.used,
              };
            }),
          })),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  archive: () =>
    trpc.cards.archive.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.cards.pathKey()], () => [
          ...patchCardList((row) =>
            row.id === vars.id ? { ...row, archived: vars.archived } : row,
          ),
          // usage only lists active cards; unarchiving settles on refetch.
          ...(vars.archived ? patchCardUsage((usage) => dropUsageCard(usage, vars.id)) : []),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  delete: () =>
    trpc.cards.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.cards.pathKey()], () => [
          ...patchCardList((row) => (row.id === vars.id ? null : row)),
          ...patchCardUsage((usage) => dropUsageCard(usage, vars.id)),
        ]),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),
};

/* ------------------------------ categories ------------------------------ */

export const categoryMutations = {
  create: () =>
    trpc.categories.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.categories.pathKey()], () => {
          const now = new Date().toISOString();
          const row: CategoryRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            kind: "expense",
            color: vars.color ?? null,
            icon: vars.icon ?? null,
            isSystem: false,
            isCreditCard: vars.isCreditCard ?? false,
            createdAt: now,
            updatedAt: now,
          };
          return insertIntoList<CategoryRow>(trpc.categories.list.pathKey(), row, {
            position: (rows) => rows.findIndex((r) => r.name.localeCompare(row.name) > 0),
          });
        }),
      onError: rollback,
      onSettled: invalidateOnSettle([trpc.categories.pathKey()]),
    }),

  update: () =>
    trpc.categories.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic(
          [trpc.categories.pathKey(), trpc.bills.list.pathKey(), trpc.recurring.list.pathKey()],
          () => [
            ...patchList<CategoryRow>(trpc.categories.list.pathKey(), (row) =>
              row.id === vars.id ? { ...row, ...defined(vars) } : row,
            ),
            // Embedded refs on bills/templates pick the rename/recolor up too.
            ...patchBillLists((row) =>
              row.categoryId === vars.id && row.category
                ? { ...row, category: { ...row.category, ...defined(vars) } }
                : row,
            ),
            ...patchRecurringLists((row) =>
              row.categoryId === vars.id && row.category
                ? {
                    ...row,
                    category: {
                      ...row.category,
                      name: vars.name ?? row.category.name,
                      color: vars.color === undefined ? row.category.color : vars.color,
                    },
                  }
                : row,
            ),
          ],
        ),
      onError: rollback,
      onSettled: invalidateOnSettle([
        trpc.categories.pathKey(),
        trpc.bills.pathKey(),
        trpc.recurring.pathKey(),
      ]),
    }),

  delete: () =>
    trpc.categories.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic(
          [trpc.categories.pathKey(), trpc.bills.list.pathKey(), trpc.recurring.list.pathKey()],
          () => [
            ...patchList<CategoryRow>(trpc.categories.list.pathKey(), (row) =>
              row.id === vars.id ? null : row,
            ),
            // FK is `set null` server-side — mirror it on cached rows.
            ...patchBillLists((row) =>
              row.categoryId === vars.id ? { ...row, categoryId: null, category: null } : row,
            ),
            ...patchRecurringLists((row) =>
              row.categoryId === vars.id ? { ...row, categoryId: null, category: null } : row,
            ),
          ],
        ),
      onError: rollback,
      onSettled: invalidateOnSettle([trpc.categories.pathKey(), ...moneyKeys()]),
    }),
};

/* -------------------------------- income -------------------------------- */

const incomeSettleKeys = () => [trpc.income.pathKey(), ...moneyKeys()];

export const incomeMutations = {
  create: () =>
    trpc.income.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.income.pathKey()], () => {
          const now = new Date().toISOString();
          const row: IncomeRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            amount: vars.amount,
            currency: vars.currency ?? "BRL",
            dayOfMonth: vars.dayOfMonth ?? null,
            active: vars.active ?? true,
            createdAt: now,
            updatedAt: now,
          };
          return insertIntoList<IncomeRow>(trpc.income.list.pathKey(), row);
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(incomeSettleKeys()),
    }),

  update: () =>
    trpc.income.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.income.pathKey()], () =>
          patchList<IncomeRow>(trpc.income.list.pathKey(), (row) =>
            row.id === vars.id ? { ...row, ...defined(vars) } : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(incomeSettleKeys()),
    }),

  delete: () =>
    trpc.income.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.income.pathKey()], () =>
          patchList<IncomeRow>(trpc.income.list.pathKey(), (row) =>
            row.id === vars.id ? null : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(incomeSettleKeys()),
    }),

  setOverride: () =>
    trpc.income.setOverride.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.income.pathKey()], () =>
          patchQueries<OverrideRow[], OverridesInput>(
            trpc.income.listOverrides.pathKey(),
            (rows, input) => {
              if (input?.from && vars.month < input.from) return rows;
              if (input?.to && vars.month > input.to) return rows;
              const now = new Date().toISOString();
              const existing = rows.find((r) => r.month === vars.month);
              const next: OverrideRow = existing
                ? { ...existing, amount: vars.amount }
                : {
                    id: tempId(),
                    userId: "",
                    month: vars.month,
                    amount: vars.amount,
                    createdAt: now,
                    updatedAt: now,
                  };
              const others = rows.filter((r) => r.month !== vars.month);
              const at = others.findIndex((r) => r.month > vars.month);
              return at < 0 ? [...others, next] : [...others.slice(0, at), next, ...others.slice(at)];
            },
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(incomeSettleKeys()),
    }),

  clearOverride: () =>
    trpc.income.clearOverride.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.income.pathKey()], () =>
          patchList<OverrideRow, OverridesInput>(trpc.income.listOverrides.pathKey(), (row) =>
            row.month === vars.month ? null : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(incomeSettleKeys()),
    }),
};

/* ------------------------------- settings ------------------------------- */

export const settingsMutations = {
  update: () =>
    trpc.settings.update.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.settings.get.pathKey()], () => {
          // Currency changes are deliberately NOT patched optimistically:
          // every amount on screen is server-converted, so flipping the label
          // before the refetch would show numbers in the wrong currency.
          const instant = defined({
            projectionHorizonMonths: vars.projectionHorizonMonths,
            defaultAdditionalSpend: vars.defaultAdditionalSpend,
            weekStartsOn: vars.weekStartsOn,
            locale: vars.locale,
            theme: vars.theme,
          });
          return patchQueries<Settings>(trpc.settings.get.pathKey(), (settings) => ({
            ...settings,
            ...instant,
          }));
        }),
      onError: rollback,
      onSettled: invalidateOnSettle([trpc.settings.pathKey(), ...moneyKeys()]),
    }),
};

/* ---------------------------------- fx ---------------------------------- */

const fxSettleKeys = () => [trpc.fx.pathKey(), ...moneyKeys()];

export const fxMutations = {
  setRate: () =>
    trpc.fx.setRate.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.fx.pathKey()], () =>
          patchList<FxRow>(trpc.fx.list.pathKey(), (row) =>
            row.base === vars.base && row.quote === vars.quote
              ? { ...row, rate: vars.rate, source: "manual", asOf: new Date().toISOString() }
              : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(fxSettleKeys()),
    }),

  /** Rate comes from the public feeds — nothing to predict client-side. */
  refresh: () =>
    trpc.fx.refresh.mutationOptions({
      onSettled: invalidateOnSettle(fxSettleKeys()),
    }),
};

/* --------------------------------- plans -------------------------------- */

function patchPlanList(patch: (row: PlanRow) => PlanRow | null): Snapshot {
  return patchList<PlanRow>(trpc.plans.list.pathKey(), patch);
}

export const planMutations = {
  create: () =>
    trpc.plans.create.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.plans.list.pathKey()], () => {
          const now = new Date().toISOString();
          const row: PlanRow = {
            id: tempId(),
            userId: "",
            name: vars.name,
            totalAmount: vars.totalAmount,
            currency: vars.currency ?? "BRL",
            mode: vars.mode ?? "lump_sum",
            installments: vars.installments ?? null,
            startDate: vars.startDate,
            sourceAccountId: vars.sourceAccountId ?? null,
            status: "draft",
            notes: vars.notes ?? null,
            createdAt: now,
            updatedAt: now,
            sourceAccount: accountRef(vars.sourceAccountId),
          };
          // plans.list is newest-first.
          return insertIntoList<PlanRow>(trpc.plans.list.pathKey(), row, { position: () => 0 });
        }),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  commit: () =>
    trpc.plans.commit.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.plans.list.pathKey()], () =>
          patchPlanList((row) =>
            row.id === vars.id ? { ...row, status: "committed" as const } : row,
          ),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),

  delete: () =>
    trpc.plans.delete.mutationOptions({
      onMutate: (vars) =>
        applyOptimistic([trpc.plans.list.pathKey()], () =>
          patchPlanList((row) => (row.id === vars.id ? null : row)),
        ),
      onError: rollback,
      onSettled: invalidateOnSettle(moneyKeys()),
    }),
};
