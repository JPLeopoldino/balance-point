# 09 — Screens & Flows

Every screen, its layout, the data it calls (doc 07), and its states. Layout sketches are
desktop; §8.8 defines the responsive collapse. Auth screens (login/sign‑up) already exist
in the scaffold — restyle them to the theme but don't redesign the flow.

Navigation (sidebar desktop / bottom‑tab mobile):
**Dashboard · Bills · Accounts · Cards · Subscriptions · Projection · Plans · Activity ·
Settings**

---

## 9.1 App shell

- **Left sidebar** (desktop): brand mark (yellow dot + "Balance Point"), nav items with
  lucide icons, active item highlighted in yellow. Collapses to icons on `md`.
- **Top bar:** page title, a **month switcher** (◀ `July 2026` ▶) that drives month‑scoped
  screens, a **currency switcher** (`BRL ⇄ USD`) that sets the display currency for all
  roll‑ups, a primary **"+ Add bill"** button, and the user menu (existing `user-menu`).
- The display currency is app‑level state (persist in `user_settings.displayCurrency`);
  changing it re‑renders every converted total (dashboard, projection, plans).
- **Bottom tab bar** (mobile): 5 primary destinations; "More" opens the rest.
- The month switcher's selected month is app‑level state (persist in URL `?month=YYYY-MM`).

## 9.2 Dashboard — `/dashboard`

The home screen; reproduces the spreadsheet's Dashboard. One call: `dashboard.summary()`.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Good evening, João            July 2026 ◀ ▶     [BRL ⇄ USD]   [+ Add bill]│
├───────────────┬───────────────┬───────────────┬───────────────────────┤
│ TOTAL MONEY   │ WALLET        │ INVESTED      │ TOTAL CREDIT (free)     │
│ R$ 14.798,20  │ R$ 4.677,78   │ R$ 10.120,42  │ R$ 18.500,00            │  ← count-up
├───────────────┴───────────────┼───────────────┴───────────────────────┤
│ MONTH BILLS (remaining)       │ FREE THIS MONTH   FREE TOTAL           │
│ R$ 12.012,45   ▓▓▓▓▓░░ 44%     │ −R$ 7.334,67      R$ 2.785,75          │
│ next month: R$ 9.952,21        │ (red if negative)                     │
├───────────────────────────────┴───────────────────────────────────────┤
│  ACCOUNTS (own currency)                    NEXT BILL                    │
│  ● Nubank  BRL    R$ 81,02 / R$ 0,00        Rent · R$ 2.100,00           │
│  ● Merc.Pago BRL  R$ 4.596,76 / R$ 10.120,42 due in 5 days  [Pay]        │
│  ● Amex    USD    $0.00 / $1,200.00                                       │
├───────────────────────────────────────────────────────────────────────┤
│  CARDS (free credit)     Nubank ▓▓▓░ R$ 3.200  ·  Renner ▓▓▓▓▓ R$ 8.900  │
├───────────────────────────────────────────────────────────────────────┤
│  SPENDING BY MONTH (bar)        │   PROJECTION (area, next 10 months)   │
│  ▁▃▅█▆▅▄▃▃▃▃▃                    │   ╱╲___╱───────                        │
└─────────────────────────────────┴───────────────────────────────────────┘
```

- **KPI cards** (§8.6 count‑up), all in the **display currency**: Total Money, Wallet,
  Invested, **Total Credit** (= Σ free credit across cards, §4.3). Then Month bills (with a
  paid‑progress bar = `paidBills/totalBills`), Free Month, Free Total — Free values turn
  `destructive` when negative (as in the sample).
- **Accounts** mini‑list: `checking / investment` in **each account's own currency** (with
  a currency chip). Click → account detail.
- **Cards** strip: per‑card **free credit** with a usage bar (`used/limit`); click → Cards
  screen. This is the breakdown behind the Total Credit KPI.
- **Next bill** card with an inline **Pay** action (`bills.pay`).
- **Charts:** spending‑by‑month bar (`bills.monthSummary`) and projection area
  (`projection.get`). Reduced to stacked, swipeable cards on mobile.
- States: skeleton cards while loading; empty state guides first‑run users to add an
  account.

## 9.3 Bills — `/bills` (month view + bulk pay)

The workhorse. Month‑scoped list from `bills.list({ month })`.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Bills — July 2026 ◀ ▶      Total R$ 9.952,21 · Paid R$ 0,00 · Left …    │
│ [ All | Unpaid | Paid ]  [Category ▾] [Account ▾]  🔍          [+ Bill] │
├──┬───────────────┬───────────┬──────────┬────────────┬─────────────────┤
│☐ │ Name          │ Category  │ Due      │ Amount     │ Status / Action │
├──┼───────────────┼───────────┼──────────┼────────────┼─────────────────┤
│☑ │ Rent          │ Housing   │ Jul 05   │ R$ 2.100,00│ [Pay]           │
│☑ │ Car Loan Inst.│ Loan      │ Jul 09   │ R$ 3.078,56│ [Pay]           │
│☐ │ Electricity   │ Utilities │ Jul 08   │ R$ 200,00  │ ● Due soon [Pay]│
│☐ │ Credit Nubank │ Credit    │ Jul 08   │ R$ 580,00  │ [Pay]           │
├──┴───────────────┴───────────┴──────────┴────────────┴─────────────────┤
│ ▸ 2 selected · R$ 5.178,56      Pay from [Mercado Pago ▾]   [Pay 2]     │  ← bulk bar
└───────────────────────────────────────────────────────────────────────┘
```

- **Header** shows month totals (`totalBills / paidBills / remaining`). Filter tabs
  (All/Unpaid/Paid), category & account filters, search.
- **Row:** checkbox, name, category badge, due date (overdue = red, due‑soon = yellow),
  amount (tabular, with a currency chip when not the display currency), status/Pay. A
  card‑charge row shows the card instead of a Pay button. Row menu: edit, delete, mark
  unpaid. Paying a foreign‑currency bill from a different‑currency account shows the
  converted debit + rate in the confirm/toast (§4.5).
- **Bulk‑select bar** appears when ≥1 selected: shows count + sum, a "Pay from" account
  select (default = each bill's own source), and **Pay N** (`bills.bulkPay`). Post‑action
  toast + list/dashboard invalidation. Paid rows animate out of the "Unpaid" filter.
- **Create/Edit** in a `dialog`/`sheet`: name, amount (decimal input) + **currency**
  (`select`, defaults to source account's), due date (`calendar`), category (`select`),
  **pay from** = source account **or** "charge to a card" (`creditCardId`), notes. A "make
  recurring" shortcut opens the recurring form pre‑filled. Bills charged to a card are
  settled via the card statement (no direct Pay — §4.3/§4.5).
- Mobile: rows become stacked cards; bulk bar sticks to the bottom above the tab bar.
- States: skeleton rows; empty ("No bills in July — Add one or generate from recurring").

**Pay flow:** click Pay → optimistic update → `bills.pay` → on success show toast; if
`warning` (negative balance) show it in the toast and tint the account. Undo available via
`bills.unpay` from the row menu.

## 9.4 Accounts — `/accounts` (+ detail)

- **List:** account cards (color dot, name, institution, **currency chip**), checking +
  investment shown in the account's own currency. `[+ Add account]`.
- **Detail / edit:** editable `checkingBalance` and `investmentBalance` (inline edit →
  `accounts.updateBalance`, logs to activity), currency, color/icon, archive, delete (with
  reassign per §4.10). Lists the **credit cards hosted on this account** with a shortcut to
  add one.
- **Yield config** panel (`switch` to enable): annual rate (%), compounding (monthly),
  "next accrual" preview; saves via `accounts.setYield`. Shows last accrual from activity.
- Editing a balance shows a subtle activity note ("Balance updated · was R$ …").

## 9.4a Cards — `/cards`

Credit cards and the **Total Credit** breakdown. `cards.list` + `cards.usage`.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Cards                         Total free credit  R$ 18.500,00           │
│                                                            [+ Add card] │
├───────────────────────────────┬───────────────────────────────────────┤
│ Nubank Ultravioleta (Nubank)  │ Renner (Mercado Pago)                   │
│ Limit R$ 12.000  ·  BRL       │ Limit R$ 10.000  ·  BRL                 │
│ Used  R$ 8.800  ▓▓▓▓▓▓▓░░      │ Used  R$ 1.100  ▓░░░░░░░░               │
│ Free  R$ 3.200                │ Free  R$ 8.900                          │
│ Charges: Spotify, Gym, …      │ Charges: (one‑off) …                    │
└───────────────────────────────┴───────────────────────────────────────┘
```

- Each card shows **limit / used / free** (own currency) and a usage bar; the header sums
  **free credit** in the display currency (the KPI). Expanding a card lists the recurring
  expenses/subscriptions and open bills charged to it (the drivers of `used`, §4.3).
- **Add/edit card:** bankAccount (the host), name, brand, credit limit, currency, closing/
  due day, color. Delete blocked while charges are assigned (reassign/clear first).
- Assigning a charge to a card happens from the bill/recurring/subscription forms
  (`creditCardId`), not here — this screen is the capacity view.

## 9.5 Subscriptions — `/subscriptions`

Mirrors the spreadsheet's subscriptions table. `recurring.list({ kind:'subscription' })` +
`recurring.subscriptionTotals()`.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Subscriptions     Monthly R$ 839,46 · On cards R$ 612,00 (credit cost)   │
│                                                            [+ Subscription]│
├───────────────┬────────┬───────────┬──────────┬──────────┬──────────────┤
│ Name          │ Value  │ Frequency │ Charged to│ Next chg │ Active        │
│ Spotify       │ 27,90  │ Monthly   │ 💳 Nubank │ Aug 02   │  ●━━ (on)     │
│ Endel         │ 34,90  │ 6 months  │ 💳 Renner │ Jan 10   │  ●━━ (on)     │
│ Nintendo      │ 48,00  │ 3 months  │ Checking  │ —        │  ━━○ (off)    │
└───────────────┴────────┴───────────┴──────────┴──────────┴──────────────┘
```

- **Active** is a `switch` (`recurring.toggleActive`). The header shows **Monthly**
  (`subsMonthly`) and **On cards** (`monthlyCreditCost`, the credit cost) — both update
  live (§4.4). A subscription charged to a card feeds that card's used credit (§4.3).
- Create/edit form: name, value + **currency**, frequency (Monthly / every N months /
  Manual), renew day, category, **charged to** = source account or a **credit card**
  (`creditCardId`), end mode. `kind` fixed to `subscription`.
- Next charge computed from frequency + renew day.

## 9.6 Recurring bills — `/recurring` (management)

Same entity as subscriptions but `kind='bill'` (Rent, taxes, loans). Adds an explicit
**Generate** action:

- List templates with frequency, renew day, end mode (infinite / until date / N
  installments — show installment progress via `progress`).
- **"Generate bills"** button (`recurring.generate`, optionally `throughMonth`) with a
  **preview** first (`recurring.preview`) listing which months would be created and which
  already exist (idempotent — never duplicates).
- Create/edit form covers all fields in doc 05 §5.6, including **currency**, **charged to**
  (source account or a credit card), end mode + installments, and a start date.

## 9.7 Projection — `/projection`

Reproduces the spreadsheet's projection grid + a chart. `projection.get`.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Projection    Horizon [10 ▾] months   [x] Include investment yield      │
├───────────────────────────────────────────────────────────────────────┤
│  (area chart of projected balance; below-zero shaded red)               │
├────────┬──────────┬──────────┬───────────────┬────────────┬────────────┤
│ Month  │ Income   │ Bills    │ Additional ✎  │ Yield      │ Balance     │
│ Aug 26 │ 20.000   │ 9.952,21 │ 0             │ +137       │ 12.833,54   │
│ Sep 26 │ 18.550   │ 7.816,35 │ 5.000  ✎      │ +139       │ 18.567,19   │
│  …      │          │          │               │            │             │
└────────┴──────────┴──────────┴───────────────┴────────────┴────────────┘
```

- Horizon selector, "include yield" toggle. **Additional spend** is editable per row
  (updates the projection live via the `additionalSpend[]` input).
- Income cell editable → sets a per‑month override (`income.setOverride`).
- Negative projected balances highlighted; first negative month flagged.
- Seeded from **Free Total** (doc 04 §4.8); values must match the worked example.

## 9.8 Plans / Budgets — `/plans`

- **List** of purchase plans (draft/committed) with name, total, mode, start, source
  account, and a mini affordability indicator.
- **Simulator** (`plans.simulate`): pick account, amount, lump vs. installments, start
  date, horizon → line chart of **baseline vs. balance‑with‑plan**, `minBalance`,
  `firstNegativeMonth`, and an **Affordable / Tight / Not yet** verdict (`badge`).
- **Commit** (`plans.commit`) turns the plan into real bills (confirmation `alert-dialog`
  explaining it will create N bills); committed plans link to their generated bills.

```
New car — R$ 120.000, 24× from Mercado Pago, starting Sep 2026
Min balance over horizon: −R$ 3.240   ● Not affordable until +2 months
[ baseline ──────  with plan ╲____ ]                         [Commit plan]
```

## 9.9 Activity — `/activity`

Reverse‑chronological feed from `activity.list` (paid/unpaid, balance edits, yield
accruals, plan commits). Each row: icon by type, description, signed amount, resulting
balance, timestamp, and account. Filter by account/type. Powers "undo" affordances.

## 9.10 Settings — `/settings`

- Profile (from Better‑Auth) + sign‑out.
- **Categories** manager (list/add/edit/delete, mark credit‑card, color/icon).
- **Currency & rates:** base currency, default display currency, and an **exchange‑rate**
  editor for USD↔BRL (`fx.setRate`, scaled 1e6, with `asOf`). Warn when a rate is stale/
  missing (§4.1a).
- **Preferences:** default projection horizon, default additional spend, week start,
  locale, theme (dark/light/system). `settings.update`.
- Income management (baseline incomes: add/edit/delete, **currency**, active toggle).

## 9.11 First‑run / onboarding

On first login: seed default categories + `user_settings` (server‑side, idempotent). The
dashboard shows an empty state with a 3‑step nudge: **1) Add an account → 2) Add this
month's bills (or a recurring template) → 3) See your projection.** Keep it skippable.

## 9.12 Cross‑cutting UI rules

- Money always via `@balance-point/money`; tabular numerals in every table/KPI (§8.3–8.4).
- Every money‑moving action → toast + query invalidation (dashboard + touched list).
- Overdue/ due‑soon logic per doc 04 §4.13 drives row/badge coloring everywhere bills
  appear.
- All destructive actions confirm via `alert-dialog`; paid‑bill deletes explain the
  balance reversal.
- Loading = skeletons, not spinners; empty = `empty` component with a primary action.
