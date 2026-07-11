# 06 — Architecture

How the code is organized and the conventions to follow. The scaffold already exists —
**extend it, don't re‑create it.**

---

## 6.1 Stack (as scaffolded)

| Concern | Choice | Where |
|--------|--------|-------|
| Monorepo | Turborepo + npm workspaces | root `turbo.json`, `package.json` |
| Web | Next.js 16 (App Router), React 19 | `apps/web` (:3001) |
| API transport | Next route handlers: tRPC 11 (fetch adapter) + Better‑Auth | `apps/web/src/app/api/*` |
| API/domain | tRPC routers + pure functions | `packages/api` |
| DB | PostgreSQL + Drizzle ORM | `packages/db` |
| Auth | Better‑Auth (email+password) | `packages/auth` |
| UI kit | shadcn/ui, Tailwind v4, Base UI | `packages/ui` |
| Env | typed env (zod) | `packages/env` |
| Money (new) | integer‑cents + currency/FX helpers | `packages/money` → `@balance-point/money` |

Data flow: **Web (RSC + TanStack Query)** → tRPC client → **Next route handler
`/api/trpc`** → tRPC router (`packages/api`) → domain functions → **Drizzle** →
**Postgres**. Everything is same‑origin: auth cookies flow to `/api/auth/*` and populate
`ctx.session`.

```mermaid
flowchart LR
    subgraph web[apps/web · Next.js :3001]
      RSC[Server Components] --> RQ[TanStack Query + tRPC proxy]
      RQ -->|HTTP /api/trpc| SRV[route handlers · app/api/*]
    end
    SRV --> API[packages/api routers]
    API --> DOMAIN[domain fns · lib/]
    DOMAIN --> DB[(packages/db · Drizzle)]
    DB --> PG[(PostgreSQL)]
    web -->|cookies /api/auth| AUTH[packages/auth]
    AUTH --> DB
    API --> MONEY[@balance-point/money]
    web --> MONEY
    web --> UI[@balance-point/ui]
```

## 6.2 Package responsibilities

- **`packages/db`** — schema (doc 05), Drizzle client (`createDb`/`db`), migrations.
  Owns *no* business logic. Exports tables + inferred types.
- **`packages/api`** — the only place with business logic. Two layers:
  - `src/routers/*` — thin tRPC procedures: validate input (zod), check ownership, call
    domain functions, shape output.
  - `src/lib/*` — **pure, framework‑free domain functions** (balances, roll‑ups,
    projection, recurrence, yield, plan simulation). Unit‑testable without a DB where
    possible; DB‑touching functions take `db` + `userId` as args.
- **`packages/money`** *(new)* — integer‑cents helpers (doc 04 §4.1). Zero deps. Imported
  by both `api` and `web` so formatting/parsing is identical on both sides.
- **`packages/auth`** — Better‑Auth config; do not couple domain logic here.
- **`packages/ui`** — shared shadcn components + design tokens (doc 08). No app logic.
- **`apps/web`** — screens, forms, charts, and client state, plus the API transport:
  route handlers under `src/app/api/` mount tRPC (`/api/trpc`) and Better‑Auth
  (`/api/auth/*`). UI code talks only to tRPC.

## 6.3 Conventions

### Adding a tRPC router
1. Create `packages/api/src/routers/<feature>.ts`.
2. Use `protectedProcedure` for everything (all data is user‑scoped). Read the user id
   from `ctx.session.user.id`.
3. Validate every input with **zod**. Money inputs are integers (minor units); coerce and
   `.int().nonnegative()` where appropriate.
4. Enforce ownership on every row you read/mutate: `where(eq(table.userId, userId))`.
   Never trust an id from the client without the `userId` filter.
5. Wrap multi‑write operations (pay, bulk pay, commit plan) in a **Drizzle transaction**.
6. Register it in `routers/index.ts`:
   ```ts
   export const appRouter = router({
     healthCheck: publicProcedure.query(() => "OK"),
     accounts: accountsRouter,
     cards: cardsRouter,
     fx: fxRouter,
     bills: billsRouter,
     recurring: recurringRouter,
     income: incomeRouter,
     projection: projectionRouter,
     plans: plansRouter,
     categories: categoriesRouter,
     dashboard: dashboardRouter,
     activity: activityRouter,
     settings: settingsRouter,
   });
   ```

### Domain functions
- Keep pure math in `packages/api/src/lib/` (e.g. `balances.ts`, `rollups.ts`, `credit.ts`,
  `projection.ts`, `recurrence.ts`, `yield.ts`, `plan.ts`). Currency conversion lives in
  `@balance-point/money` (`convert`, `FX_SCALE`); these functions take the display currency
  + a rate map and convert before aggregating (doc 04 §4.1a). They map 1:1 to doc 04's
  rules and are where unit tests live.
- DB access uses Drizzle query builder; prefer `db.query.<table>.findMany({ where })` with
  relations for reads and explicit `insert/update` for writes.

### Web data access
- Read: `useQuery(trpc.<router>.<proc>.queryOptions(input))`.
- Write: `useMutation(trpc.<router>.<proc>.mutationOptions())`, and on success
  **invalidate** affected queries. Add a small `lib/invalidate.ts` that invalidates the
  dashboard + the touched lists after any money‑moving mutation (pay, edit balance, etc.).
- Prefer server components for initial data where practical; use client components for
  interactive lists, forms, and charts.
- **Format money only in the UI** via `@balance-point/money`. The API returns integer
  minor units.

### Errors & validation
- Throw `TRPCError` with proper codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`,
  `FORBIDDEN`). The web `queryClient` already shows an error toast with a retry action.
- Business‑rule soft warnings (e.g. "this payment makes the balance negative") are
  **not** errors — return them in the payload and let the UI decide.

### Naming
- Files & routers: `kebab-case` file, `camelCase` export (`bills.ts` → `billsRouter`).
- DB tables: `snake_case`; TS identifiers: `camelCase`.
- Remember: **`bank_account`, never `account`** (Better‑Auth owns `account`).

## 6.4 Environment & running

- Env is typed in `packages/env` (`server.ts`, `web.ts`). Server side needs
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; there are no public
  (`NEXT_PUBLIC_*`) vars — clients call same‑origin `/api/*`. Everything lives in
  `apps/web/.env` (see `.env.example`).
- Dev: `npm run dev` (or `dev:web`). DB: `npm run db:push` (dev),
  `db:generate` + `db:migrate` (versioned). Types: `npm run check-types` (add a
  `check-types` script to every new package, as the repo already does).

## 6.5 Testing (recommended)

- Unit‑test the pure domain functions in `packages/api/src/lib/*` against the worked
  examples in doc 04 (they were reverse‑engineered from the spreadsheet, so they double as
  golden tests): Wallet/Invested/Total, `remainingBills`, projection row 1 = `12833.54`,
  recurrence month enumeration, plan simulation, yield accrual.
- A light integration test per money‑moving procedure (pay, bulk‑pay, unpay, commit plan)
  asserting the **audit invariant** (doc 04 §4.15.3).
