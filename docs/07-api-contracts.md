# 07 — API Contracts (tRPC)

The tRPC surface. All procedures are **`protectedProcedure`** and implicitly scoped to
`ctx.session.user.id`. Inputs are zod‑validated; **money is integer minor units**. Types
below are TypeScript shorthand for the zod input / the returned shape.

Common types:

```ts
type Money = number;              // integer centavos
type Month = string;              // 'YYYY-MM'
type ISODate = string;            // 'YYYY-MM-DD'
type Id = string;
```

Every mutation that moves money runs in a transaction and returns the updated entities so
the client can update the cache. On the web, invalidate `dashboard.summary` + the touched
list after such mutations.

---

## 7.1 `accounts`

```ts
accounts.list()                       → BankAccount[]           // non-archived first, by sortOrder
accounts.get({ id })                  → BankAccount
accounts.create({
  name, institution?, currency='BRL', checkingBalance=0, investmentBalance=0,
  color?, icon?,
})                                     → BankAccount             // credit limits live on cards (§7.1a)
accounts.update({ id, ...editable })  → BankAccount             // name, institution, color, icon, sortOrder
accounts.updateBalance({
  id, field: 'checking' | 'investment', amount: Money,          // absolute new value
})                                     → BankAccount             // logs balance_edited (§4.2)
accounts.archive({ id, archived })    → BankAccount
accounts.delete({ id, reassignToId? })→ { ok: true }            // blocked if referenced & no reassign (§4.10)

// Yield (§4.11)
accounts.getYield({ bankAccountId })  → YieldConfig | null
accounts.setYield({
  bankAccountId, enabled, annualRateBps, compounding='monthly',
})                                     → YieldConfig
accounts.accrueYield()                → { accrued: {accountId, amount}[] } // catch-up all enabled configs
```

## 7.1a `cards` (credit cards)

```ts
cards.list({ bankAccountId? })        → CreditCard[]
cards.get({ id })                     → CreditCard
cards.create({
  bankAccountId, name, brand?, creditLimit: Money, currency='BRL',
  closingDay?, dueDay?, color?, icon?,
})                                     → CreditCard
cards.update({ id, ...editable })     → CreditCard
cards.archive({ id, archived })       → CreditCard
cards.delete({ id })                  → { ok: true }            // blocked if it has assigned charges; else nulls refs

// Derived credit (§4.3). Amounts returned in each card's own currency AND display currency.
cards.usage({ displayCurrency? })     → {
  totalCreditAvailable: Money,         // Σ available across cards, in display currency ("Total Credit" KPI)
  totalUsed: Money, totalLimit: Money,
  cards: {
    id, name, currency, limit: Money, used: Money, available: Money,
    availableInDisplay: Money,
  }[],
}
```

## 7.1b `fx` (exchange rates)

```ts
fx.list()                             → ExchangeRate[]          // the user's stored pairs
fx.setRate({ base, quote, rate })     → ExchangeRate            // rate scaled by 1e6; upsert on (base,quote)
fx.convert({ amount: Money, from: Currency, to: Currency }) → { amount: Money, rate: number }
```

> If a needed pair is missing, money endpoints return the foreign amounts unconverted plus
> a `warnings: ["Set the USD→BRL rate"]` entry (§4.1a), never a hard error.

## 7.2 `categories`

```ts
categories.list()                     → Category[]
categories.create({ name, color?, icon?, isCreditCard=false }) → Category
categories.update({ id, ...editable }) → Category
categories.delete({ id })             → { ok: true }            // reassigns refs to null (§4.10)
```

## 7.3 `bills`

```ts
bills.list({
  month?: Month,                       // default current month
  paid?: boolean, categoryId?: Id, accountId?: Id, creditCardId?: Id,
  from?: ISODate, to?: ISODate,        // date range instead of month
  search?: string,
})                                     → Bill[]                 // native currency; ordered by dueDate

bills.get({ id })                     → Bill

bills.create({
  name, amount: Money, currency?, dueDate: ISODate,             // currency defaults to source account's
  sourceAccountId?, creditCardId?, categoryId?, notes?,          // creditCardId ⇒ a card charge (not paid from checking)
})                                     → Bill                    // sets month from dueDate

bills.update({ id, ...editable })     → Bill                    // name, amount, dueDate, category, source, notes
bills.delete({ id })                  → { ok: true }            // reverses payment first if paid (§4.10)

// Payment (§4.5–4.7)
bills.pay({ id, fromAccountId? })     → { bill: Bill, account: BankAccount, warning?: string }
bills.unpay({ id })                   → { bill: Bill, account: BankAccount }
bills.bulkPay({
  ids: Id[], fromAccountId?,           // if omitted, each bill uses its sourceAccountId
})                                     → {
  paidCount, skippedCount, totalPaid: Money,
  accounts: BankAccount[],             // updated balances
  warnings: string[],
}

// Derived (§4.13)
bills.next()                          → { bill: Bill, daysUntil: number } | null
bills.monthSummary({ year })          → {
  month: Month, totalBills: Money, paidBills: Money, remainingBills: Money,
}[]                                    // 12 rows; feeds the roll-up table & charts
bills.spendingByCategory({ month? , from?, to? }) → { categoryId, name, color, total: Money }[]
```

## 7.4 `recurring` (recurring bills + subscriptions)

```ts
recurring.list({ kind?: 'bill'|'subscription' }) → RecurringExpense[]
recurring.get({ id })                 → RecurringExpense
recurring.create({
  name, defaultAmount: Money, currency='BRL', kind='bill', categoryId?,
  sourceAccountId?, creditCardId?,                     // creditCardId ⇒ charged to a card (drives used credit)
  frequency='monthly', intervalMonths=1, renewDay,
  endMode='infinite', endDate?, installmentsTotal?, startDate,
})                                     → RecurringExpense
recurring.update({ id, ...editable }) → RecurringExpense        // future generations only (§4.9)
recurring.toggleActive({ id, active })→ RecurringExpense
recurring.delete({ id, deleteFutureBills=false }) → { ok, deletedBills: number }

// Generation (§4.9) — idempotent
recurring.preview({ id, throughMonth?: Month }) → {
  month: Month, dueDate: ISODate, amount: Money, alreadyExists: boolean,
}[]
recurring.generate({ id?, throughMonth?: Month }) → { created: number, bills: Bill[] }
                                       // id omitted = generate for ALL active templates

// Subscriptions view helpers (kind='subscription'), in display currency (§4.4)
recurring.subscriptionTotals()        → {
  subsMonthly: Money,                   // active subscriptions, monthly-equivalent
  monthlyCreditCost: Money,             // active recurring+subs charged to any card
}
```

## 7.5 `income`

```ts
income.list()                         → Income[]
income.create({ name, amount: Money, currency='BRL', dayOfMonth?, active=true }) → Income
income.update({ id, ...editable })    → Income
income.delete({ id })                 → { ok: true }
income.listOverrides({ from?: Month, to?: Month }) → IncomeOverride[]
income.setOverride({ month: Month, amount: Money }) → IncomeOverride   // upsert
income.clearOverride({ month: Month }) → { ok: true }
```

## 7.6 `projection` (§4.8)

```ts
projection.get({
  horizonMonths?,                      // default USER_SETTINGS.projectionHorizonMonths (10)
  includeYield?: boolean,              // default true
  additionalSpend?: { month: Month, amount: Money }[], // per-month overrides
}) → {
  seedFreeTotal: Money,
  rows: {
    month: Month, income: Money, bills: Money,
    additionalSpend: Money, yield: Money, projectedBalance: Money,
  }[],
}
```

## 7.7 `plans` (purchase plans / budgets, §4.12)

```ts
plans.list()                          → PurchasePlan[]
plans.get({ id })                     → PurchasePlan
plans.create({
  name, totalAmount: Money, currency='BRL', mode='lump_sum', installments?,
  startDate: ISODate, sourceAccountId, notes?,
})                                     → PurchasePlan            // status='draft'
plans.update({ id, ...editable })     → PurchasePlan
plans.delete({ id })                  → { ok: true }

plans.simulate({
  // simulate an existing draft OR an ad-hoc plan (all fields inline)
  id?, name?, totalAmount?, mode?, installments?, startDate?, sourceAccountId?,
  horizonMonths?,
}) → {
  rows: { month: Month, baselineBalance: Money, planOutflow: Money, balanceWithPlan: Money }[],
  minBalance: Money, firstNegativeMonth: Month | null, affordable: boolean,
}

plans.commit({ id })                  → { plan: PurchasePlan, bills: Bill[] } // draft→committed (§4.12)
```

## 7.8 `dashboard`

One call powering the whole dashboard (all KPIs from doc 04 §4.2–4.4). All top‑level money
is in `displayCurrency` (defaults to `user_settings.displayCurrency`):

```ts
dashboard.summary({ displayCurrency? }) → {
  displayCurrency: Currency,
  wallet: Money, invested: Money, totalMoney: Money,
  monthBills: Money, nextMonthBills: Money,
  freeMonth: Money, freeTotal: Money,
  freeMonthNext: Money, freeTotalNext: Money,
  totalCredit: Money,                   // Σ available credit across cards (§4.3) — the "Total Credit" KPI
  subscriptionsMonthly: Money,          // active subscriptions monthly-equivalent (§4.4)
  monthlyCreditCost: Money,             // recurring+subs charged to cards (§4.4)
  accounts: {
    id, name, color, icon, currency: Currency,
    checking: Money, investment: Money,  // in the account's OWN currency
  }[],
  cards: {
    id, name, currency: Currency, limit: Money, used: Money, available: Money,
  }[],
  nextBill: { bill: Bill, daysUntil: number } | null,
  warnings: string[],                   // e.g. missing FX rate (§4.1a)
  currentMonth: Month,
}
```

## 7.9 `activity`

```ts
activity.list({ limit=50, cursor?, accountId?, type? }) → {
  items: ActivityLog[], nextCursor?: string,
}
```

## 7.10 `settings`

```ts
settings.get()                        → UserSettings            // creates defaults on first read
settings.update({ ...editable })      → UserSettings            // baseCurrency, displayCurrency, horizon, defaultAdditionalSpend, weekStartsOn, locale, theme
```

---

## 7.11 Ownership & error contract (applies to every procedure)

- Load‑by‑id always filters `where(and(eq(t.id, id), eq(t.userId, userId)))`; a miss →
  `TRPCError('NOT_FOUND')`.
- Cross‑entity references (e.g. `sourceAccountId` on a bill) must also belong to the user;
  otherwise `TRPCError('FORBIDDEN')`.
- Validation failures → `BAD_REQUEST` (zod does this automatically).
- Soft warnings (negative balance) ride in the success payload's `warning`/`warnings`.
- First read of `settings.get` / first login **seeds** default categories and a
  `user_settings` row (idempotent).
