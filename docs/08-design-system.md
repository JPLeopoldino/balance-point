# 08 — Design System

A **dark‑first**, **warm‑yellow** theme that feels calm and friendly for a finance tool.
Built on the existing Tailwind v4 + shadcn/ui setup in `packages/ui`. Tokens are **oklch**
and live in `packages/ui/src/styles/globals.css` (already the token home — see doc 06).

---

## 8.1 Brand & mood

- **Dark by default.** The app ships dark; light is a supported secondary theme.
- **Yellow is the single accent** — used for primary actions, focus, the active nav item,
  key figures, and highlights. Use it **sparingly** so it stays meaningful (a dashboard
  glowing entirely yellow reads as noise). Most surfaces are warm near‑black + grays.
- **Semantic finance colors:** green = positive/income, red = negative/overspend/overdue,
  yellow = attention/due‑soon. Never encode meaning with yellow *and* use it decoratively
  in the same view.
- Tone: confident, quiet, precise. Rounded cards, generous spacing, tabular numbers.

## 8.2 Color tokens (replace the current grayscale set)

Paste these over the `:root` and `.dark` blocks in `globals.css`. Light is a clean
inversion; **dark is the designed default**.

```css
/* DARK — the primary, designed theme */
.dark {
  --background: oklch(0.17 0.006 95);      /* warm near-black */
  --foreground: oklch(0.96 0.004 95);
  --card: oklch(0.21 0.007 95);
  --card-foreground: oklch(0.96 0.004 95);
  --popover: oklch(0.21 0.007 95);
  --popover-foreground: oklch(0.96 0.004 95);

  --primary: oklch(0.84 0.16 92);          /* warm golden yellow */
  --primary-foreground: oklch(0.24 0.03 95);/* dark text ON yellow (AA on primary) */

  --secondary: oklch(0.27 0.008 95);
  --secondary-foreground: oklch(0.96 0.004 95);
  --muted: oklch(0.27 0.008 95);
  --muted-foreground: oklch(0.72 0.01 95);
  --accent: oklch(0.30 0.03 95);           /* subtle warm hover */
  --accent-foreground: oklch(0.96 0.004 95);

  --destructive: oklch(0.64 0.21 25);      /* red — negative / delete */
  --success: oklch(0.72 0.17 155);         /* green — positive / income */
  --warning: oklch(0.83 0.15 85);          /* amber — due soon */

  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.84 0.16 92 / 60%);       /* yellow focus ring */

  /* Categorical chart palette (distinct hues, ~equal L/C, dark-safe) */
  --chart-1: oklch(0.84 0.16 92);          /* yellow (brand) */
  --chart-2: oklch(0.72 0.13 195);         /* teal */
  --chart-3: oklch(0.70 0.15 300);         /* violet */
  --chart-4: oklch(0.72 0.16 40);          /* orange */
  --chart-5: oklch(0.70 0.13 240);         /* blue */
  --chart-6: oklch(0.74 0.15 155);         /* green */

  --radius: 0.75rem;

  --sidebar: oklch(0.19 0.006 95);
  --sidebar-foreground: oklch(0.92 0.004 95);
  --sidebar-primary: oklch(0.84 0.16 92);
  --sidebar-primary-foreground: oklch(0.24 0.03 95);
  --sidebar-accent: oklch(0.27 0.008 95);
  --sidebar-accent-foreground: oklch(0.96 0.004 95);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.84 0.16 92 / 60%);
}

/* LIGHT — supported secondary */
:root {
  --background: oklch(0.99 0.004 95);
  --foreground: oklch(0.22 0.01 95);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.22 0.01 95);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.22 0.01 95);
  --primary: oklch(0.80 0.16 88);
  --primary-foreground: oklch(0.24 0.03 95);
  --secondary: oklch(0.96 0.006 95);
  --secondary-foreground: oklch(0.24 0.01 95);
  --muted: oklch(0.96 0.006 95);
  --muted-foreground: oklch(0.50 0.01 95);
  --accent: oklch(0.94 0.02 92);
  --accent-foreground: oklch(0.24 0.01 95);
  --destructive: oklch(0.58 0.22 27);
  --success: oklch(0.60 0.15 155);
  --warning: oklch(0.75 0.15 80);
  --border: oklch(0.90 0.01 95);
  --input: oklch(0.90 0.01 95);
  --ring: oklch(0.80 0.16 88 / 50%);
  --chart-1: oklch(0.78 0.16 88);
  --chart-2: oklch(0.62 0.13 195);
  --chart-3: oklch(0.58 0.16 300);
  --chart-4: oklch(0.66 0.17 40);
  --chart-5: oklch(0.60 0.14 240);
  --chart-6: oklch(0.62 0.15 155);
  --radius: 0.75rem;
  /* sidebar-* mirror the above for light */
}
```

Then expose the new semantic tokens in the `@theme inline` block so Tailwind emits
utilities like `bg-success` / `text-warning`:

```css
@theme inline {
  /* …keep existing mappings… */
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-chart-6: var(--chart-6);
}
```

**Contrast rules:** always dark text on yellow (`primary-foreground`), never yellow text
on dark for body copy (fails AA at small sizes). Yellow text is allowed only for large
figures/headlines. Body text must meet **WCAG AA (4.5:1)**; large text/UI **3:1**.

## 8.3 Typography

- **UI font:** Geist Sans (already wired in `apps/web/src/app/layout.tsx`). Keep
  `--font-sans` for body.
- **Numbers:** use **tabular figures** everywhere money or dates align in columns/tables:
  `className="tabular-nums"` (or `font-variant-numeric: tabular-nums`). Money in tables,
  KPI cards, and the projection grid must be tabular so digits line up.
- **Mono:** Geist Mono for IDs/technical only.
- Scale (Tailwind): page title `text-2xl/semibold`, section `text-lg/medium`, KPI value
  `text-3xl/semibold tabular-nums`, body `text-sm`, meta `text-xs text-muted-foreground`.

## 8.4 Money & value formatting (display)

- Always render via `formatMoney(units, currency)` from `@balance-point/money`:
  `BRL → R$ 1.900,00` (pt‑BR), `USD → $1,900.00` (en‑US). Never hard‑code the symbol.
- **Multi‑currency cues:** show each amount in its **own** currency; when a list mixes
  currencies, show a small currency chip (`BRL`/`USD`). **Converted roll‑ups** (dashboard
  totals, projection) render in the **display currency** and expose the native amount +
  rate in a tooltip. A **currency switcher** (BRL ⇄ USD) sits in the top bar (§8.8, doc 09).
- **Color by sign/meaning, not by raw number:** income/positive deltas `text-success`;
  bills/expenses/negative `text-destructive`; neutral balances default foreground.
- Prefix explicit deltas with `+`/`−`. In dense lists, expenses may show as `−R$ 350,00`.
- Compact form (`R$ 1,9 mil` / `$1.9k`) allowed on small chart axes and tight cards.

## 8.5 Components

Use shadcn/ui from `@balance-point/ui`. Already present: `button`, `card`, `input`,
`label`, `checkbox`, `dropdown-menu`, `tooltip`, `skeleton`, `textarea`, `empty`,
`input-group`, `sonner`. **Add** these (run from repo root, per README):

```
npx shadcn@latest add dialog sheet table tabs select switch badge \
  progress popover calendar separator scroll-area alert-dialog \
  avatar breadcrumb chart -c packages/ui
```

Usage map:

| Need | Component |
|------|-----------|
| Create/edit bill, account, plan | `dialog` (desktop) / `sheet` (mobile) with a form |
| Bills month table, bulk‑select | `table` + `checkbox` |
| Month/year navigation, view switch | `tabs` / segmented buttons |
| Source account, category pickers | `select` |
| Active/yield toggles | `switch` |
| Category chips, statuses (Paid/Overdue/Due soon) | `badge` |
| Plan affordability, installment progress | `progress` |
| Confirm delete / reverse payment | `alert-dialog` |
| Toasts (paid N bills, errors) | `sonner` (wired) |
| Charts | `chart` (Recharts) — see §8.7 |

Statuses → badges: **Paid** (success, subtle), **Overdue** (destructive), **Due soon**
(warning), **Pending** (muted).

## 8.6 Motion

Add **`motion`** (Framer Motion v11+): `npm i motion -w @balance-point/ui` (or in web).
Motion is **subtle and functional**, never bouncy.

- **KPI numbers count up** on the dashboard when data loads (animate value 0→n over
  ~600ms, ease‑out). Use a small `<AnimatedNumber/>` that formats via `@balance-point/money`.
- **Card entrance:** dashboard cards fade+rise (`opacity 0→1`, `y 8→0`) with a **stagger**
  of ~40ms.
- **List items** (bills) animate height/opacity on add/remove/pay via `AnimatePresence`.
- **Route/tab changes:** quick cross‑fade (120–160ms). No layout thrash.
- **Charts** reveal by growing bars/lines from baseline once.
- **Respect `prefers-reduced-motion`:** gate all non‑essential motion; fall back to
  instant. Provide a `useReducedMotion()` check.
- Durations: micro 120ms, standard 200–300ms, count‑up 600ms. Easing: `ease-out` in,
  `ease-in-out` for moves.

## 8.7 Charts

Use the shadcn `chart` wrapper (Recharts) and the **`--chart-1..6`** tokens. Follow the
`dataviz` skill when building any chart.

- **Monthly spending** (bar): 12 months, total vs. paid; overdue emphasized. Y in compact
  money, X month labels.
- **Category breakdown** (donut or horizontal bars): paid bills by category for a month.
- **Projection** (area/line): projected balance over the horizon; shade below‑zero region
  `destructive`; mark `firstNegativeMonth`.
- **Plan simulation** (line): baseline vs. balance‑with‑plan; highlight the dip.
- Keep axes light, gridlines faint (`border` at low opacity), tooltips using `popover`
  tokens. One accent (yellow) for the "primary" series; supporting series use chart‑2…6.

## 8.8 Layout & responsiveness

- **Breakpoints (Tailwind default):** `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- **Desktop (≥lg):** fixed **left sidebar** nav (icons + labels) + top bar (month switcher,
  **currency switcher BRL⇄USD**, quick "Add bill", user menu). Content max‑width ~`1280px`.
- **Tablet (md):** collapsible/icon‑only sidebar.
- **Mobile (<md):** **bottom tab bar** (Dashboard, Bills, Accounts, Plan, More); top bar
  shows the current screen + month switcher. Dialogs become **sheets**. KPI cards stack
  1‑col; bills table becomes stacked cards; wide tables get `overflow-x-auto`.
- Grids: KPI row `grid-cols-2 md:grid-cols-4`; account cards `grid-cols-1 sm:grid-cols-2
  lg:grid-cols-3`.
- Touch targets ≥44px; never rely on hover for a primary action on mobile.

## 8.9 States (every list/data view must define all four)

- **Loading:** `skeleton` placeholders matching final layout (not spinners) for cards,
  tables, charts.
- **Empty:** use the `empty` component with a friendly line + a primary action
  (e.g. "No bills this month — Add your first bill").
- **Error:** the global query error toast handles fetch errors (retry action already
  wired); inline error text for form/validation issues.
- **Success feedback:** `sonner` toast after mutations ("Paid 6 bills · R$ 8.240,00").

## 8.10 Accessibility

- WCAG AA contrast (§8.2). Yellow only carries meaning with an icon/label too (don't rely
  on color alone for Paid/Overdue — pair with text/icon).
- Visible **focus ring** (yellow) on all interactive elements; full keyboard operability
  for dialogs, menus, tables, bulk‑select.
- Respect `prefers-reduced-motion`. Label icon‑only buttons with `aria-label`.
- Form fields use `label` + descriptive errors; money inputs use `inputmode="decimal"`.
