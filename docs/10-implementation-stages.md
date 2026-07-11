# 10 — Implementation Stages

Build **in order**. Each stage is shippable, has explicit **acceptance criteria**, and
lists the docs it draws from. Don't start a stage until the previous one's criteria pass.
Every stage ends with: `npm run check-types` clean, `npm run db:push` applied, and the new
flow demonstrated end‑to‑end.

Legend: **BE** = backend (`packages/db`, `packages/api`, `packages/money`),
**FE** = web (`apps/web`), **UI** = `packages/ui`.

---

## Stage 0 — Foundation

**Goal:** the skeleton every feature needs. No finance features yet.

- **BE** Create `@balance-point/money` (doc 04 §4.1/§4.1a): `Money`, `Currency`
  (`BRL`|`USD`), `CURRENCIES`, `formatMoney(units, currency)`, `toMinorUnits`,
  `fromMinorUnits`, `sumMoney`, and **FX** (`FX_SCALE=1e6`, `convert(units, from, to,
  rates)`). Add `check-types`; make `api` and `web` depend on it.
- **BE** Add all Drizzle tables + enums (doc 05) — incl. `credit_card`, `exchange_rate`,
  and `currency` columns — re‑export from `schema/index.ts`, `db:push`. Add inferred types.
- **BE** Seed logic: on first `settings.get`/login, create default categories + a
  `user_settings` row + a default `USD→BRL` exchange rate (idempotent).
- **UI** Replace theme tokens with the dark+yellow set (doc 08 §8.2); add the extra shadcn
  components (§8.5); install `motion`.
- **FE** App shell: sidebar + top bar + mobile bottom‑tab (doc 09 §9.1), **month switcher**
  and **currency switcher (BRL⇄USD)** state, auth‑gated routes (redirect to `/login`),
  restyle auth screens.

**Acceptance:** app boots dark‑themed with working nav, month + currency switchers; a
logged‑in user has seeded categories + settings + a default FX rate;
`formatMoney(190000,'BRL')` → `"R$ 1.900,00"`, `formatMoney(190000,'USD')` → `"$1,900.00"`;
`convert(100_00,'USD','BRL',{USD_BRL:5_430_000})` → `543_00`; `check-types` clean.

---

## Stage 1 — Accounts & core dashboard KPIs

**Goal:** manage bank accounts and see Wallet / Invested / Total Money.
**Depends on:** 0. **Docs:** 04 §4.2–4.3, 07 §7.1/§7.8, 09 §9.2/§9.4.

- **BE** `accounts` router: list/get/create/update/updateBalance/archive/delete (with
  reassign guard §4.10). `updateBalance` writes an `activity_log` row. Domain `balances.ts`
  with `wallet/invested/totalMoney` aggregates.
- **BE** `dashboard.summary` returning account facets (own currency) + Wallet/Invested/
  Total **converted to the display currency** (§4.2/§4.1a); bills fields can be 0 until
  Stage 2. Accounts carry a `currency`.
- **FE** Accounts screen (list, create/edit incl. currency, inline balance edit, archive/
  delete). KPI cards for Total/Wallet/Invested with count‑up (doc 08 §8.6), reacting to the
  currency switcher.

**Acceptance:** create the three sample accounts with the sample balances → dashboard shows
**Wallet 4.677,78 / Invested 10.120,42 / Total 14.798,20** (doc 02 §2.2‑B). Adding a **USD**
account and switching display to BRL folds it in at the stored rate; switching to USD shows
USD natively. Editing a balance updates the KPI and appends an activity row. Deleting a
referenced account is blocked/reassigned.

---

## Stage 2 — Bills: entry, month view, single pay

**Goal:** the core bill ledger and payment with balance deduction.
**Depends on:** 1. **Docs:** 04 §4.4–4.6/§4.13/§4.14, 05 §5.5, 07 §7.3, 09 §9.3.

- **BE** `bills` router: list (by month/filters), get, create (with `currency`), update,
  delete (reverse‑pay first if paid), `pay`, `unpay`, `next`, `monthSummary`. Set `month`
  from `dueDate`. Payment converts to the account currency, records `paidFxRate`, mutates
  checking + logs activity, in a transaction (§4.5).
- **BE** `fx` router (`list`/`setRate`/`convert`) reading the seeded rate; roll‑ups convert
  each bill to the display currency (§4.1a).
- **BE** Extend `dashboard.summary` with `monthBills`, `nextMonthBills`, `freeMonth`,
  `freeTotal`, `freeMonthNext`, `freeTotalNext`, `nextBill` (§4.4). Domain `rollups.ts`.
- **FE** Bills month view (filters, totals header, create/edit dialog with calendar +
  category/account selects), single Pay/Unpay with toast + invalidation. Dashboard Month
  bills card (with paid progress), Free cards (red when negative), Next bill card.

**Acceptance:** enter June's sample bills; mark the paid ones → **Month bills 12.012,45**,
and paying a bill reduces the source account's checking by exactly its amount and appends
activity; unpay restores it. A **USD bill paid from a BRL account** deducts the converted
amount and stores `paidFxRate`; unpay reverses at the same rate. Next bill = earliest unpaid
with value > 0. Negative Free values render red. `monthSummary` matches doc 02 §2.2‑C.

---

## Stage 3 — Bulk pay & spending visualization

**Goal:** pay many bills at once; see spending.
**Depends on:** 2. **Docs:** 04 §4.7/§4.13, 07 §7.3, 08 §8.7, 09 §9.2/§9.3.

- **BE** `bills.bulkPay` (one transaction, per‑account grouped deltas, skip already‑paid,
  return summary + updated accounts §4.7). `bills.spendingByCategory`.
- **FE** Bulk‑select bar (count + sum + "pay from" + Pay N). Dashboard **spending‑by‑month**
  bar chart (`monthSummary`) and a **category breakdown** chart. Charts follow §8.7 +
  `dataviz` skill.

**Acceptance:** select N unpaid bills → one confirm → all marked paid, correct total
deducted (grouped per account), summary toast shown; already‑paid selections are skipped,
not errored. Spending charts render from real data with theme colors and reduced‑motion
support.

---

## Stage 4 — Recurring expenses & subscriptions

**Goal:** automate recurring bills + the subscriptions screen.
**Depends on:** 2. **Docs:** 04 §4.4/§4.9, 05 §5.6, 07 §7.4, 09 §9.5/§9.6.

- **BE** `recurring` router: CRUD (incl. `currency`, `creditCardId`), `toggleActive`,
  `preview`, `generate` (idempotent per `(recurringExpenseId, month)`, all end modes,
  `clampDay`), `subscriptionTotals` (`subsMonthly` + `monthlyCreditCost`). Domain
  `recurrence.ts`. Wire `subscriptionsMonthly` + `monthlyCreditCost` into
  `dashboard.summary`. Templates with a `creditCardId` do **not** generate standalone
  payable bills (they feed card usage, §4.3).
- **FE** Subscriptions screen (active toggle, "charged to" account/card, live totals) and
  Recurring‑bills management (preview → generate, installment progress). "Make recurring"
  shortcut from a bill.

**Acceptance:** create a monthly "Rent" template → generate through N months creates one
unpaid bill per month on the renew day, and **re‑running creates nothing new**. An
`installments=12` template emits exactly 12 stamped bills. Subscriptions totals match doc
02 §2.2‑D (**Monthly 839,46**); assigning a subscription to a card moves its cost into
`monthlyCreditCost`; toggling Active updates the totals.

---

## Stage 4b — Credit cards & Total Credit

**Goal:** manage credit cards and the **Total Credit** KPI (free credit across cards).
**Depends on:** 1, 4. **Docs:** 04 §4.3, 05 §5.3a, 07 §7.1a, 09 §9.2/§9.4a.

- **BE** `cards` router: CRUD (host account, limit, currency, closing/due day), `usage`
  (derived `used`/`available` per card + `totalCreditAvailable`, converted to display
  currency). Domain `credit.ts` (`monthlyEquivalent`, `committedMonthly`, `openCharges`,
  `used`, `available`). Wire `totalCredit` + `cards[]` into `dashboard.summary`.
- **FE** Cards screen (per‑card limit/used/free + usage bar; expand to see assigned
  charges), add/edit card, host‑account card list, dashboard **Total Credit** KPI + cards
  strip. Bill/recurring/subscription forms expose "charge to card".

**Acceptance:** a card with limit R$12.000 and R$8.800 of assigned active recurring/
subscriptions shows **used 8.800 / free 3.200**; adding an unpaid one‑off charge on the card
reduces free further; **Total Credit** = Σ free across cards in the display currency, and
its per‑card breakdown matches. A USD card folds into Total Credit at the stored rate.

---

## Stage 5 — Income & projection

**Goal:** salary + forward balance projection.
**Depends on:** 2 (4 improves accuracy). **Docs:** 04 §4.8, 05 §5.7, 07 §7.5/§7.6, 09 §9.7.

- **BE** `income` router (CRUD + overrides upsert). `projection.get` (domain
  `projection.ts`): seed from Free Total, iterate income − (bills + additional), per‑month
  additional overrides, optional yield term.
- **FE** Projection screen: horizon selector, editable additional‑spend and income cells,
  area chart with below‑zero shading, first‑negative flag. Dashboard projection preview.

**Acceptance:** with the sample inputs, projection **row 1 = 12.833,54** and **row 2 =
18.567,19** (doc 02 §2.2‑E / doc 04 §4.8). Editing additional spend or an income override
updates the row and chart live. Horizon respects `user_settings`.

---

## Stage 6 — Investment yield

**Goal:** investment balances grow automatically.
**Depends on:** 1, 5. **Docs:** 04 §4.11, 05 §5.3, 07 §7.1, 09 §9.4.

- **BE** `accounts.setYield/getYield`, `accounts.accrueYield` (catch‑up by whole elapsed
  months, compounding, logs `yield_accrued`). Domain `yield.ts` (bps → monthly rate, round
  to units). Feed yield into `projection.get` when `includeYield`.
- **FE** Yield panel on account detail (enable switch, rate, next‑accrual preview);
  projection "include yield" toggle reflects it.

**Acceptance:** enabling 12%/yr on a R$10.000,00 investment and accruing one month adds
**R$ 100,00** (10.000 × 0,01), logs an activity row, and advances `lastAccruedAt`;
re‑running same month adds nothing. Projection with yield on exceeds yield off by the
accrued amounts.

---

## Stage 7 — Purchase plans / budgets

**Goal:** simulate and commit future purchases.
**Depends on:** 5. **Docs:** 04 §4.12, 05 §5.8, 07 §7.7, 09 §9.8.

- **BE** `plans` router: CRUD, `simulate` (baseline vs. with‑plan series, `minBalance`,
  `firstNegativeMonth`, `affordable`), `commit` (draft→committed, generate installment
  bills tagged `purchasePlanId`). Domain `plan.ts`.
- **FE** Plans list + simulator (chart baseline vs. with‑plan, verdict badge) + commit
  confirmation.

**Acceptance:** a R$120.000 / 24× plan produces 24 monthly outflows in the simulation with
a correct `minBalance` and `firstNegativeMonth`; **Commit** creates 24 unpaid bills
(rounding remainder in the last), and they appear in the normal Bills flow; deleting the
plan's unpaid bills reverses the commit.

---

## Stage 8 — Polish, activity, onboarding, a11y

**Goal:** production‑ready feel.
**Depends on:** all. **Docs:** 08 (all), 09 §9.1/§9.9/§9.10/§9.11.

- **FE** Activity feed screen; Settings (categories manager, preferences, income);
  first‑run onboarding nudge. Motion pass (count‑up, staggered cards, list transitions,
  chart reveals) honoring `prefers-reduced-motion`. Full responsive pass (bottom‑tab,
  sheets, stacked tables, `overflow-x-auto`). Loading skeletons + empty states on every
  view. Accessibility pass (contrast, focus rings, keyboard, aria‑labels).

**Acceptance:** every list/table has skeleton + empty + populated states; all money uses
tabular numerals and `formatMoney`; keyboard can operate dialogs, bulk‑select, and the
month switcher; reduced‑motion disables non‑essential animation; app is usable at 360px
width; Lighthouse a11y ≥ 90.

---

## Definition of done (whole app)

The owner can reproduce **every number** on the spreadsheet's Dashboard from the same
inputs — Wallet, Invested, Total, Month bills, Free (month/total), subscriptions monthly,
the 12‑month roll‑up, and the projection — **plus** the new **Total Credit** (free credit
across cards) and **multi‑currency** viewing (BRL⇄USD) — and the recurring‑bill, bulk‑pay,
credit‑card, and projection workflows are faster than editing the sheet by hand (doc 01
§1.5). Business rules in doc 04 have unit tests using the worked examples as golden values,
including FX conversion and `used`/`available` credit (doc 06 §6.5).

## Suggested build order recap

`0 → 1 → 2 → 3 → 4 → 4b → 5 → 6 → 7 → 8`. Stages 3–4 can overlap once 2 is done; **4b
(cards)** needs 4 for card‑charge usage; 6 needs 5 for the projection term; 7 needs 5.
Multi‑currency/FX is set up in Stage 0 and exercised from Stage 2 on. Keep each stage's PR
scoped to its acceptance criteria.
