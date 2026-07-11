# Balance Point — Product & Engineering Documentation

Balance Point is a personal‑finance web app for tracking **bank accounts, balances,
bills, subscriptions, income, and financial projections**. It is modeled directly on
the owner's real spreadsheet (`docs/finances-sheet.xlsx`), which is the **source of
truth** for all business rules.

This folder is the specification an AI agent (or a human) should read **before writing
any code**. It is written so that each document is self‑contained but cross‑referenced.

> ⚠️ **Language:** all documentation and all code identifiers/comments are in **English**.
> The app UI ships in English too (the spreadsheet mixes Portuguese labels — those are
> data, not UI copy).

---

## How to read these docs

Read in order. Each file builds on the previous one.

| # | Document | What it gives you |
|---|----------|-------------------|
| — | [`README.md`](./README.md) | This index, canonical decisions, conventions |
| 01 | [`01-vision-and-scope.md`](./01-vision-and-scope.md) | Why the app exists, the user persona, goals / non‑goals, glossary |
| 02 | [`02-spreadsheet-reference.md`](./02-spreadsheet-reference.md) | Faithful decode of the source spreadsheet: every formula, the month‑block layout, sample data |
| 03 | [`03-domain-model.md`](./03-domain-model.md) | Entities, relationships, ER diagram |
| 04 | [`04-business-rules.md`](./04-business-rules.md) | The precise, testable rules: money, balances, payment, recurrence, projection, yield, budgets |
| 05 | [`05-data-model.md`](./05-data-model.md) | Concrete Drizzle/PostgreSQL schema for every table |
| 06 | [`06-architecture.md`](./06-architecture.md) | Stack, monorepo layout, package responsibilities, conventions, data flow |
| 07 | [`07-api-contracts.md`](./07-api-contracts.md) | tRPC routers & procedures (inputs/outputs) per feature |
| 08 | [`08-design-system.md`](./08-design-system.md) | Dark + yellow theme tokens, typography, motion, charts, a11y |
| 09 | [`09-screens-and-flows.md`](./09-screens-and-flows.md) | Every screen, its layout, responsive behavior, and states |
| 10 | [`10-implementation-stages.md`](./10-implementation-stages.md) | Phased build plan with scope, dependencies, and acceptance criteria |

**If you are the building agent:** implement **stage by stage** from doc 10. Do not skip
ahead. Each stage lists its own acceptance criteria.

---

## Canonical product decisions

These decisions resolve ambiguity in the spreadsheet and the initial brief. They are
**binding**; every other document assumes them. Where a decision extends beyond the
spreadsheet it is marked _(extends source)_.

1. **Multi‑currency (BRL + USD), integer minor units.** Every money amount is stored as an
   **integer number of minor units** (`bigint`) **in its own currency** (`currency`
   column: `'BRL'` \| `'USD'`; both have 2 decimals). Never store money as a float. Each
   account/bill/card carries its currency. The user picks a **display currency** (defaults
   to `baseCurrency` = BRL) and all roll‑ups (Wallet, Invested, Total, projections) are
   **converted to the display currency** via stored **FX rates** (scaled by `1e6`). See
   doc 04 §4.1a.
2. **Balances are stored and directly user‑editable** — not derived from a ledger. This
   mirrors the spreadsheet, where the user overwrites account balances at will. Actions
   that change a balance (e.g. paying a bill) mutate the stored balance and are recorded
   in an append‑only **activity log** for history/undo _(extends source)_.
3. **Bank accounts, credit cards, and subscriptions are three separate features.** A bank
   account has a `checking` (corrente) and an `investment` (investido) balance. **Credit
   cards** are their own entity, each **registered on a bank account** with its own credit
   limit; recurring expenses/subscriptions can be **charged to a card**, consuming its
   credit. The **"Total Credit"** KPI = **total free (available) credit across all cards**
   (with a per‑card breakdown). **Subscriptions** are a separate feature (see #5) that
   relates to credit: a subscription charged to a card counts as a monthly cost of that
   card. See doc 03 and doc 04 §4.3.
4. **Bills belong to a calendar month.** A bill is a dated payable with a `paid` flag.
   Paying it **deducts its amount from the source account's checking balance**.
5. **Recurring expenses generate bills.** "Recurring bills" and "subscriptions" are one
   concept — a `recurring_expense` template with a frequency, a renew day, and an end
   mode (infinite / until‑date / N installments). A generator materializes concrete
   monthly bills from templates. Subscriptions are just templates flagged as such. A
   template may optionally be **charged to a credit card** (`creditCardId`) instead of
   being paid from checking — that assignment is what drives a card's used credit (#3).
6. **Income (salary) drives projection.** A monthly income with optional per‑month
   overrides feeds a forward balance **projection** over a configurable horizon.
7. **Investment yield is optional and per‑account.** An investment balance may grow
   automatically via a configured annual rate (monthly compounding) _(extends source)_.
8. **Purchase plans / budgets are what‑if projections.** The user plans a future expense
   (lump sum or installments) and sees the projected account balance over time; a plan
   can be "committed" into real bills _(extends source)_.
9. **Everything is user‑scoped.** Every domain row carries `userId`; every procedure is a
   `protectedProcedure`. Users only ever see their own data.
10. **Naming:** the domain bank‑account table is **`bank_account`** — the name `account`
    is already taken by Better‑Auth (OAuth accounts). Do not reuse it.

---

## Repository conventions (already true in the scaffold)

The project is a **Better‑T‑Stack** monorepo. Respect what exists; do not re‑scaffold.

- **Monorepo:** Turborepo + npm workspaces (`apps/*`, `packages/*`).
- **Web:** Next.js 16 App Router, React 19, runs on **:3001** (`apps/web`).
- **API:** tRPC 11 + Better‑Auth served by the Next app itself via route handlers
  (`apps/web/src/app/api/`): tRPC at `/api/trpc`, Better‑Auth at `/api/auth/*`.
- **DB:** PostgreSQL + Drizzle ORM. Schema lives in `packages/db/src/schema/*.ts` and is
  re‑exported from `schema/index.ts`. Apply with `npm run db:push`.
- **Auth:** Better‑Auth (email + password) in `packages/auth`. Session is available on the
  tRPC context as `ctx.session`.
- **API/business logic:** `packages/api` (tRPC routers + pure domain functions).
- **UI kit:** shadcn/ui in `packages/ui` (Tailwind v4, oklch tokens, Base UI primitives,
  lucide icons, sonner toasts). Import as `@balance-point/ui/components/<name>`.
- **Data fetching:** TanStack Query via the tRPC proxy — `trpc` from
  `apps/web/src/utils/trpc.ts`, e.g. `useQuery(trpc.bills.list.queryOptions({ month }))`.
- **Money package (to create):** shared money helpers live in a new
  `@balance-point/money` package used by both `api` and `web`. See doc 04 & 06.

Run everything from the repo root: `npm run dev` (or `npm run dev:web`),
`npm run db:push`, `npm run check-types`.

---

## The golden rule

> When in doubt, **the spreadsheet wins.** If a rule here contradicts
> `docs/finances-sheet.xlsx`, treat it as a bug in this doc and reconcile toward the
> spreadsheet's observed behavior (see doc 02 for the exact decoded formulas).
