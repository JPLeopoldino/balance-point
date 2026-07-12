# 04 — Business Rules

The precise, testable rules the app must implement. These translate the spreadsheet's
formulas (doc 02) into unambiguous logic. Every rule is written so it can become a unit
test. Numbers in examples are BRL.

> **Convention:** all money in code is an **integer of centavos** (minor units). `R$
> 1.900,00` → `190000`. Format only at the UI edge.

---

## 4.1 Money representation & arithmetic

- **Storage:** integer minor units (`bigint`). BRL has 2 decimal places, so 1 BRL =
  100 units.
- **Never use floats** for money math. Add/subtract integers directly.
- **Rounding:** only when converting a rate result (yield, projection) back to minor
  units — use **round half away from zero** to the nearest unit.
- **A shared package `@balance-point/money`** exposes:
  - `type Money = number` (integer minor units) and `type Currency = 'BRL' | 'USD'`.
  - `CURRENCIES` metadata per code: `{ decimals: 2, symbol, locale }`
    (`BRL` → `R$` / `pt-BR`, `USD` → `$` / `en-US`).
  - `formatMoney(units, currency, { sign?, compact? })` → `"R$ 1.900,00"` / `"$1,900.00"`
    (locale grouping, always 2 decimals; optional `+`/`−` sign; optional compact).
  - `toMinorUnits(decimalString, currency)` / `fromMinorUnits(units, currency)`.
  - `sumMoney(...units)` guarded integer sum (**same‑currency only**).
  - `FX_SCALE = 1_000_000` and `convert(units, from, to, rates)` (see §4.1a).
- **Display sign convention:** balances and income are positive; bills/spend are shown as
  negative (red) in ledgers but stored as positive `amount` on the `BILL`.

---

## 4.1a Currencies & FX conversion _(extends source)_

The app supports **BRL and USD**. Every money value is stored in **its own currency**;
conversion happens only for **display/roll‑ups**.

- **Currency per entity:** `bank_account.currency`, `bill.currency`, `credit_card.currency`,
  `recurring_expense.currency`, `purchase_plan.currency`, `income.currency`. An account is
  single‑currency (both its balances are in it).
- **Base currency** = `user_settings.baseCurrency` (default `BRL`). **Display currency** =
  what the user is currently viewing in (defaults to base; toggle in the top bar).
- **Exchange rates** live in `exchange_rate` (`base`,`quote`,`rate`,`asOf`) with `rate`
  stored as an integer **scaled by `FX_SCALE = 1e6`** (e.g. 1 USD = 5,43 BRL → `5_430_000`).
  Keep both directions consistent: `rate(BRL→USD) = FX_SCALE² / rate(USD→BRL)` or store the
  inverse explicitly. v1 rates are **user‑set/manually refreshed** (no live feed).
- **Conversion:** `convert(units, from, to)`:
  - if `from === to` → `units`.
  - else `round(units * rate(from→to) / FX_SCALE)` using **integer math** and round half
    away from zero. Cast to numeric before dividing to avoid integer‑division bugs.
- **Roll‑up rule:** any aggregate that mixes currencies (Wallet, Invested, Total Money,
  Month bills, Total Credit, projection) is computed by converting **each row to the
  display currency first**, then summing. Never sum raw minor units across currencies.
- **Missing rate:** if no rate exists for a needed pair, surface a soft warning ("Set the
  USD→BRL rate") and exclude/segregate the foreign amounts rather than guessing.

---

## 4.2 Account balances

For a bank account `a`:

- `checkingBalance(a)` and `investmentBalance(a)` are **stored** integer fields, editable
  by the user at any time.
- `totalBalance(a) = checkingBalance(a) + investmentBalance(a)`.

Dashboard aggregates across **non‑archived** accounts, **each converted to the display
currency `D`** (§4.1a):

```
Wallet     = Σ convert(checkingBalance(a),   a.currency, D)   // spreadsheet B3
Invested   = Σ convert(investmentBalance(a), a.currency, D)   // spreadsheet D3
TotalMoney = Wallet + Invested                                 // spreadsheet F3
```

**Editing a balance** writes an `ACTIVITY_LOG{ type:'balance_edited', bankAccountId,
amount: new−old, balanceAfter:new }` and sets the field. No other side effects.

---

## 4.3 Credit cards, used/available credit, "Total Credit"

Credit cards are first‑class (`credit_card`), each registered on a bank account with its
own `creditLimit` and `currency`. A charge is **on a card** when a `recurring_expense` or a
`bill` sets `creditCardId`. `used`/`available` are **derived, never stored**.

**Monthly‑equivalent of a recurring charge** (amortizes non‑monthly cadences):

```
monthlyEquivalent(r) =
    r.frequency == 'monthly'         → r.defaultAmount
    r.frequency == 'every_n_months'  → round(r.defaultAmount / r.intervalMonths)
    r.frequency == 'manual'          → 0
```

**Per card `c` (all in the card's currency):**

```
committedMonthly(c) = Σ monthlyEquivalent(r)   for ACTIVE r where r.creditCardId = c
                                               (includes subscriptions — see §4.4)
openCharges(c)      = Σ b.amount               for UNPAID one-off b where b.creditCardId = c
used(c)             = committedMonthly(c) + openCharges(c)
available(c)        = c.creditLimit − used(c)          // free credit (can go negative)
```

**Dashboard "Total Credit" KPI** = total **free** credit across non‑archived cards, in the
display currency `D`, with a per‑card breakdown:

```
TotalCredit = Σ convert(available(c), c.currency, D)   // per card: {name, limit, used, available}
```

> This intentionally **diverges from the spreadsheet**, where "Total Credit" meant the
> monthly subscriptions total. Per the product owner, the app's "Total Credit" is the
> **free credit across cards** (this §), and the monthly subscription/recurring cost is a
> **separate** metric (§4.4).

**Settlement is separate:** paying off a card is an ordinary `BILL` (e.g. "Credit Card
Nubank") **paid from checking** (§4.5). Classify it with the **Credit Card category**
(`isCreditCard`) for reporting — do **not** give it a `creditCardId` (that flag marks a
non‑payable charge on the card, §4.5, and would double‑count in `used`). `used(c)` is
driven only by committed recurring charges + open one‑off purchases, never by the statement
bill. This keeps "Month bills" (what you pay) and "Total Credit" (free capacity) on
independent axes.

---

## 4.4 Monthly roll‑up, "Month bills", "Free", subscriptions total

For a month `m` (`YYYY-MM`), over all bills whose `dueDate` falls in `m`, each converted to
the display currency `D` (§4.1a):

```
totalBills(m)     = Σ convert(amount(bill), bill.currency, D)                  // spreadsheet N
paidBills(m)      = Σ convert(amount(bill), bill.currency, D) where paid=true  // spreadsheet P
remainingBills(m) = totalBills(m) − paidBills(m)                               // spreadsheet Q (unpaid)
```

(Ordinary "Credit Card X" statement bills are included here like any other bill.)

KPIs (let `thisMonth` = current month, `nextMonth` = +1):

```
MonthBills  = remainingBills(thisMonth)                     // spreadsheet I3
NextMonth   = remainingBills(nextMonth)                     // spreadsheet J3
FreeMonth   = Wallet     − MonthBills                       // spreadsheet F5
FreeTotal   = TotalMoney − MonthBills                       // spreadsheet G5
FreeMonthNext = FreeMonth − NextMonth                       // spreadsheet F7
FreeTotalNext = FreeTotal − NextMonth                       // spreadsheet G7
YearPaid    = Σ over months paidBills(m)                    // spreadsheet M62
```

**Subscriptions & monthly credit cost** (a metric distinct from Total Credit §4.3), from
active recurring expenses, converted to `D`:

```
SubsMonthly       = Σ convert(monthlyEquivalent(r), r.currency, D)
                        for ACTIVE r where kind='subscription'      // spreadsheet O103 (informational)
MonthlyCreditCost = Σ convert(monthlyEquivalent(r), r.currency, D)
                        for ACTIVE r where r.creditCardId IS NOT NULL   // recurring+subs charged to any card
```

`SubsMonthly` reproduces the spreadsheet's subscriptions figure; `MonthlyCreditCost` is the
"custo mensal do crédito" that ties subscriptions/recurring to the cards (§4.3). Neither is
the "Total Credit" KPI (that is free credit, §4.3).

> **The critical nuance:** "Month bills" is **remaining (unpaid)**, not total. A fully paid
> month shows `MonthBills = 0`. Verify against the sample: June total 17,340.28, paid
> 5,327.83 → MonthBills 12,012.45. ✔

---

## 4.5 Paying a bill (single)

**Precondition:** bill is `paid=false`, `amount>0`, `creditCardId IS NULL` (card charges are
settled via the card's statement, not paid here), and a source account is chosen (default
`sourceAccountId`, overridable at pay time).

**Effect (atomic, in one DB transaction):**

1. `bill.paid = true`, `bill.paidAt = now`, `bill.paidFromAccountId = account.id`.
2. Compute the **debit in the account's currency**:
   `debit = convert(bill.amount, bill.currency, account.currency)`; if currencies differ,
   store `bill.paidFxRate` = the rate used. Then `account.checkingBalance -= debit`.
3. Insert `ACTIVITY_LOG{ type:'bill_paid', billId, bankAccountId, amount: −debit,
   balanceAfter: account.checkingBalance }` (amount in the account's currency).

Notes:

- Paying **is allowed to drive checking negative** (the spreadsheet does not block it;
  the user tracks reality). Surface a **warning**, not an error, when it would go below 0.
- Idempotent: paying an already‑paid bill is a no‑op (return current state).

## 4.6 Un‑paying a bill & undo

Marking a paid bill unpaid reverses §4.5 exactly, using the **same rate** it was paid at:

1. `credit = convert(bill.amount, bill.currency, account.currency, bill.paidFxRate)`;
   `account.checkingBalance += credit` (to `bill.paidFromAccountId`).
2. Clear `paid`, `paidAt`, `paidFromAccountId`, `paidFxRate`.
3. Insert `ACTIVITY_LOG{ type:'bill_unpaid', amount:+credit, balanceAfter }`.

If the original `paidFromAccountId` account was deleted, credit the current
`sourceAccountId` and note it in `meta`.

## 4.7 Bulk payment

Input: a set of bill ids + optionally a single account to pay **all** from (default: each
bill's own `sourceAccountId`).

Rules:

- Process in **one transaction**; either all succeed or none do.
- Apply §4.5 per bill; **group balance deductions per account** so each account is
  updated once with the summed delta (fewer writes, one `ACTIVITY_LOG{type:'bill_paid'}`
  per bill but a single net balance recompute).
- Skip bills already paid (report them as skipped, don't fail the batch).
- Return a summary: `{ paidCount, skippedCount, totalPaid, perAccountDelta[] }`.
- Show a post‑action toast: "Paid N bills · R$ X from Account".

## 4.8 Income & forward projection

**Income for a month** `m`:

```
incomeFor(m) = INCOME_OVERRIDE[m]?.amount            // override is stored in display currency
             ?? Σ convert(INCOME.amount, INCOME.currency, D)   // baseline sum of active incomes
```

The whole projection is computed **in the display currency `D`** — `remainingBills(m)` and
`FreeTotal` are already converted (§4.2, §4.4), so seed and iterate in `D`.

**Projection** over horizon `H` months (default from `USER_SETTINGS`, sheet uses 10),
starting next month. Seed from **Free Total** (spreadsheet `G5`):

```
balance[0]      = FreeTotal
for k in 1..H:
    m           = nextMonth + (k−1)
    spend[k]    = remainingBills(m) + additionalSpend(m)     // sheet L = SUMIF(...) + M
    balance[k]  = balance[k−1] + incomeFor(m) − spend[k]     // sheet J = J(prev) + I − L
```

- `additionalSpend(m)` defaults to `USER_SETTINGS.defaultAdditionalSpend`; user may
  override per row (sheet column `M`).
- The projection is **derived on read** (never stored). Return an array of
  `{ month, income, bills, additionalSpend, projectedBalance }`.
- Verify against the sheet's first row: `balance[1] = FreeTotal + income − (nextMonthBills
  + additional)` → `2785.75 + 20000 − (9952.21 + 0) = 12833.54`. ✔

> **Investment growth in projection:** if any account has an enabled `YIELD_CONFIG`, the
> projection adds the monthly accrual (see §4.11) to `balance[k]` as a positive term.
> Expose a toggle "Include investment yield" (default on).

## 4.9 Recurrence: generating bills from templates

A `RECURRING_EXPENSE` generates concrete `BILL`s. Generation is **explicit and
idempotent** (safe to re‑run).

**Which months does a template charge?** Starting at `startDate`'s month, every
`intervalMonths` (1 for monthly, 3/6 for every‑N), on `renewDay`:

- `frequency='monthly'` → every month.
- `frequency='every_n_months'` → every `intervalMonths` months.
- `frequency='manual'` → never auto‑generates; the user adds bills by hand.

**End conditions:**

- `endMode='infinite'` → generate up to a rolling horizon (e.g. current month +
  `projectionHorizonMonths`).
- `endMode='until_date'` → stop when the charge month passes `endDate`.
- `endMode='installments'` → emit exactly `installmentsTotal` bills; stamp each with
  `installmentNumber`/`installmentTotal` and increment `installmentsGenerated`.

**For each due month, create a BILL** with:

```
dueDate         = date(year, month, clampDay(renewDay, month))
name            = template.name
amount          = template.defaultAmount     // user edits the instance afterwards
categoryId      = template.categoryId
sourceAccountId = template.sourceAccountId
recurringExpenseId = template.id
paid            = false
```

**Idempotency key:** never create a second bill for the same
`(recurringExpenseId, month)`. Re‑running generation fills only missing months.

- `clampDay(31, February)` → last day of February. Renew day never overflows a month.
- Only **active** templates generate. Deactivating stops future generation but leaves
  already‑generated bills intact (matches the sheet's per‑month rows).
- Editing a template's `defaultAmount` affects **future** generations only.

## 4.10 Referential integrity & deletion

- **Deleting a bank account:** blocked if it is the source of unpaid bills or referenced
  by templates/plans — offer "reassign to another account" or **archive** instead.
  Archived accounts drop out of dashboard sums but keep history.
- **Deleting a category:** reassign its bills/templates to `null` (Uncategorized); never
  cascade‑delete bills.
- **Deleting a recurring expense:** ask whether to also delete its **future unpaid**
  generated bills; never touch paid bills.
- **Deleting a bill:** if paid, deleting must first reverse the payment (§4.6) so the
  balance stays correct, then remove the row (log `type:'bill_deleted'`).

## 4.11 Investment yield accrual _(extends source)_

For an account with an enabled `YIELD_CONFIG`:

```
monthlyRate   = annualRatePct / 100 / 12                      // simple monthly conversion
monthlyAccrual(a) = round( investmentBalance(a) * monthlyRate )
```

- **Accrual job / on‑read catch‑up:** when the app loads (or a daily job runs), for each
  enabled config compute how many whole months elapsed since `lastAccruedAt`, apply
  `investmentBalance += monthlyAccrual` per elapsed month (compounding), set
  `lastAccruedAt`, and log `ACTIVITY_LOG{type:'yield_accrued', amount, balanceAfter}`.
- In **projection** (§4.8), yield is applied per projected month without mutating stored
  balances.
- Rate is annual‑nominal with monthly compounding by default; keep the conversion in
  `@balance-point/money` so it's testable.

## 4.12 Purchase plan / budget projection _(extends source)_

A `PURCHASE_PLAN` simulates a future expense against a source account.

**Simulation (draft, no writes):** produce a month‑by‑month series of the source account's
projected checking balance, identical to §4.8 but subtracting the plan's outflow:

```
lump_sum      → one outflow of totalAmount in startDate's month
installments  → totalAmount / installments each month for `installments` months
                (last installment absorbs the rounding remainder)
```

Return, per month: `{ month, baselineBalance, planOutflow, balanceWithPlan }` and flags:
`firstNegativeMonth` (when it dips below 0) and `minBalance`. This powers the "can I
afford this?" chart.

**Committing a plan** (`status: draft → committed`): generate real `BILL`s for each
installment (like §4.9, tagged with `purchasePlanId`), so it now shows up in the normal
Bills/pay flow. Committing is reversible only by deleting the generated unpaid bills.

## 4.13 Derived queries

- **Next bill due** (spreadsheet Next‑Bill widget): the `BILL` with the **earliest**
  `dueDate` where `paid=false AND amount>0`, across all months. Return name, amount,
  dueDate, and days‑until.
- **Spending by month:** group **paid** bills by `month(dueDate)` → sum. (Optionally show
  total vs. paid like the roll‑up table.)
- **Spending by category:** for a month or range, group paid bills by `categoryId` → sum;
  used for the breakdown chart.
- **Upcoming / overdue:** unpaid bills with `dueDate < today` are **overdue** (highlight
  red); `dueDate` within 7 days are **due soon** (highlight yellow).

## 4.14 Time & month handling

- **Month key** is `YYYY-MM`. A bill's month is `month(dueDate)`.
- Compute month boundaries and ranges in **UTC** to avoid off‑by‑one shifts in negative
  UTC offsets (Brazil is UTC‑3). Format user‑facing dates with the user's locale but
  derive month keys in UTC.
- "Current month" = `month(today)` in the user's timezone, resolved once server‑side.
- Week starts Monday by default (`USER_SETTINGS.weekStartsOn`).

## 4.15 Invariants (must always hold)

1. Money fields are integers ≥ 0 for `amount`, any integer for balances (can be negative).
2. A `BILL` has `paidAt`/`paidFromAccountId` **iff** `paid=true`.
3. Sum of all `ACTIVITY_LOG` deltas for an account, applied to its initial balance,
   reconciles to its current `checkingBalance` (audit invariant).
4. No two bills share `(recurringExpenseId, month)`.
5. A `committed` purchase plan has ≥ 1 generated bill; a `draft` has none.
6. Every domain row's `userId` matches the requesting session user (enforced in every
   procedure — see doc 07).
7. Every money value carries a `currency`; aggregates **convert to the display currency
   before summing** — raw minor units are never summed across currencies (§4.1a).
8. `used`/`available` credit is always **derived** from a card's assigned charges, never
   stored; a card references a bank account owned by the same user.
9. A bill with `creditCardId` set is a **card charge**: it is not settled via `bills.pay`
   and never deducts from a checking balance directly (§4.3, §4.5).

---

## 4.16 Rework 2026-07-12 — cards, statements & automation _(supersedes clauses above)_

Business-rule changes applied on 2026-07-12. Where a clause below conflicts with
§4.1–§4.15, **this section wins**.

### a) Cards may live without a bank account

`CREDIT_CARD.bankAccountId` is **nullable** (FK `set null`). Deleting a bank account
detaches its cards (or `reassignToId` moves them). Invariant 8's "a card references a
bank account" is dropped; the ownership rule stays.

### b) Paying without a bank & payment-time discount

- `bills.pay` accepts `withoutAccount: true` (or resolves no account at all): the bill
  is marked paid with **no debit anywhere**; `paidWithoutAccount=true`,
  `paidFromAccountId=null`. Un-paying such a bill refunds nothing. Invariant 2 becomes:
  `paidAt` **iff** `paid=true`; `paidFromAccountId` set iff paid from a bank.
- `bills.pay` accepts an optional `amount` (discount): it **replaces** the bill's
  `amount` before the debit is computed. The old value is not kept.
- "Choose an account to pay from" is no longer an error — a bill with no source
  account simply settles without a debit (also in `bulkPay`).

### c) Card charges materialize; faturas are real bills

- Recurring templates with `creditCardId` (subscriptions and card recurrences) **do**
  generate bills now — one card charge (`creditCardId` set) for the **current month
  only** (never months ahead, so open charges don't eat the limit early).
- **Used credit = open unsettled card charges** (`paid=false`, `settledByBillId null`).
  `committedMonthly` remains a display metric only (§4.3 formula superseded).
- Every active card with a `dueDay` gets an auto-generated **statement bill (fatura)**
  per month: `statementCardId` marks it; due on `dueDay`, cutoff on the `closingDay`
  occurrence at/just before it (or the due date itself). Its amount tracks the sum of
  covered open charges (converted to the card currency) while unpaid; an unpaid fatura
  left with nothing to cover is deleted. One fatura per `(card, month)`.
- A fatura **covers** the card's open, unsettled charges with `dueDate <= cutoff` not
  already covered by an older open fatura of the same card. **Paying the fatura marks
  the covered charges paid** (`settledByBillId = fatura.id`) and thereby frees the
  limit; un-paying it reopens them. Settled charges cannot be un-paid directly.
- Card charges are never overdue/payable in the UI — status **"Na fatura"** while
  open, "Paga" once settled.

### d) Daily automation (no manual buttons)

Lazily on the first money query of each calendar day (gate:
`USER_SETTINGS.lastAutoRunDay`, claimed atomically):

1. **Yield accrual** (§4.11 catch-up) — the "Accrue yield" button/procedure is gone.
2. **Recurring generation** (§4.9) for all active templates through the projection
   horizon (card templates: current month only) — the "Generate bills"
   button/procedure is gone. Templates also materialize immediately on
   create/update/re-activate.
3. **Subscription auto-pay**: unpaid, non-card, subscription-template bills with
   `dueDate <= today` are paid automatically from their source account (or without a
   bank when none). Card subscriptions settle via the fatura instead.

Additionally, card statements are ensured/refreshed on every bills/cards/dashboard
query and after any mutation that touches card charges.

### e) Screens

Subscriptions render inside **Cards** (tab), recurring templates inside **Bills**
(tab), the activity feed inside **Settings** (tab); `/subscriptions`, `/recurring`
and `/activity` redirect. The Cards screen opens with the same KPI-card layout as
Bills (limit / used / available / committed-per-month). Cards can be archived and
unarchived from an "Archived" section like bank accounts.
