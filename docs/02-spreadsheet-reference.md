# 02 — Spreadsheet Reference (the source of truth)

This document decodes `docs/finances-sheet.xlsx` so the app can reproduce its behavior
**exactly**. The workbook originated in Google Sheets (note the `FILTER`/`INDEX` array
formulas). It has two sheets: **📊 Dashboard** and **📝 Bills**.

All monetary values are BRL. Dates in the raw file are stored as serial numbers; they are
shown here as their meaning, not the serial.

---

## 2.1 Sheet "📝 Bills" — the ledger of payables

### Layout: 13 horizontal month‑blocks

Bills are laid out as **repeating column blocks, one per month**, placed left→right. Each
block is **8 columns wide** and has this shape (headers on row 9, data from row 10):

| Offset | Column (January) | Header | Meaning |
|-------:|------------------|--------|---------|
| +0 | `K` | **Date** | Due date of the bill |
| +1 | `L` | **Name** | Bill name (e.g. "Rent", "Credit Card Nubank") |
| +2 | `M` | **Value** | Amount due (BRL) |
| +3 | `N` | **Payed** | Boolean — settled or not |
| +4 | `O` | _(none)_ | Auxiliary date (helper; not referenced by any roll‑up) |
| +5..+7 | `P`,`Q`,`R` | — | Spacer columns |

The next block (February) starts 8 columns later at `S`, and so on. Full map of the
**Value** and **Payed** columns per month (used by the Dashboard roll‑ups):

| Month | Block start | Date | Name | **Value** | **Payed** |
|-------|-------------|------|------|-----------|-----------|
| January | `K` | K | L | **M** | **N** |
| February | `S` | S | T | **U** | **V** |
| March | `AA` | AA | AB | **AC** | **AD** |
| April | `AI` | AI | AJ | **AK** | **AL** |
| May | `AQ` | AQ | AR | **AS** | **AT** |
| June | `AY` | AY | AZ | **BA** | **BB** |
| July | `BG` | BG | BH | **BI** | **BJ** |
| August | `BO` | BO | BP | **BQ** | **BR** |
| September | `BW` | BW | BX | **BY** | **BZ** |
| October | `CE` | CE | CF | **CG** | **CH** |
| November | `CM` | CM | CN | **CO** | **CP** |
| December | `CU` | CU | CV | **CW** | **CX** |
| January 2027 | `DC` | DC | DD | **DE** | **DF** |

> There are **13 blocks** (Jan…Dec + next January) so the "next bill" and next‑month
> views keep working across the year boundary. The Dashboard's 12‑month roll‑up table
> only sums Jan–Dec.

Data rows run from **row 10** downward; formulas scan to row ~1003 to allow a large but
bounded number of bills per month. Empty trailing rows just have `Payed = 0`.

### Sample data — January block (real values)

| Date(K) | Name(L) | Value(M) | Payed(N) |
|---|---|---:|:--:|
| 2026‑01‑05 | Rent | 1,900.00 | ✅ |
| 2026‑01‑08 | Electricity Bill | 179.27 | ✅ |
| 2026‑01‑08 | Water Bill | 101.35 | ✅ |
| 2026‑01‑08 | Piped Gas Bill | 87.30 | ✅ |
| 2026‑01‑— | Cell Bill | 155.00 | ✅ |
| 2026‑01‑— | Nutritionist | 350.00 | ✅ |
| 2026‑01‑— | Credit Card Nubank | 979.19 | ✅ |
| 2026‑01‑— | Credit Card Digaspi | 72.00 | ✅ |
| 2026‑01‑— | Credit Card Digaspi | 69.65 | ✅ |
| 2026‑01‑— | Credit Card Renner | 2,351.87 | ✅ |
| 2026‑01‑— | iPhone 17 Loan | 1,498.18 | ✅ |
| 2026‑01‑— | Credit Card Neon | 1,623.91 | ✅ |
| 2026‑01‑— | Credit Card Amazon | 145.91 | ✅ |
| 2026‑01‑— | Credit Card Mercado Pago | 295.41 | ✅ |
| 2026‑01‑— | Credit Mercado Pago | 120.15 | ✅ |
| 2026‑01‑— | DARF CNPJ (×3) | 449.76 / 378.16 / 341.00 | ✅ |
| 2026‑01‑— | DAS CNPJ (×2) | 693.67 / 564.62 | ✅ |
| 2026‑01‑— | Accounting Office | 93.50 | ✅ |

Observations the app must honor:

- **The same name can appear multiple times in a month** (two "Credit Card Digaspi",
  three "DARF CNPJ"). Bills are individual rows, not keyed by name.
- **Values vary month to month** for the "same" bill (Rent 1,900 in Jan → 2,100 in Jul;
  card statements differ every month). Recurrence sets a default; the user edits actuals.
- Future months (e.g. July, next January) are **pre‑populated and unpaid** (`Payed = 0`)
  — this is exactly the recurring‑bill generation the app automates.

### The "Next Bill" widget (top‑left of Bills)

Cells `F1:G3` compute the **next unpaid bill** across all 13 blocks using an array
`FILTER`:

```
FILTER( names/values/dates
  WHERE   date-column   <> ""      (row exists)
    AND   payed-column  =  FALSE   (not yet paid)
    AND   value-column  >  0       (real amount)
)  → INDEX(..., 1)   // take the first match
```

Result in the sample: **Rent, 2,100.00** on **10 June** (`G2 = "10 Junho"`). The app's
equivalent: "Next bill due" = the earliest‑dated unpaid bill with value > 0.

There is also a **month navigation grid** (`B3:D6`) listing `January ↗️` … `December ↗️`
(+ `January 2027`) — hyperlinks that jump to each block. In the app this becomes a month
switcher.

---

## 2.2 Sheet "📊 Dashboard" — KPIs, projection, summaries, subscriptions

### A) Top KPI cards

`I1 = MONTH(TODAY())` is the current month number; `J1 = I1 + 1` is next month. These
index the roll‑up table below.

| KPI | Cell | Formula (decoded) | Meaning |
|-----|------|-------------------|---------|
| **Wallet** | `B3` | `= B12 + B16 + B20` | Sum of each account's **checking** balance |
| **Invested** | `D3` | `= D12 + D16 + D20` | Sum of each account's **investment** balance |
| **Total Money** | `F3` | `= B3 + D3` | Wallet + Invested |
| **Month bills** | `I3` | `= IF(month<13, SUMIF(monthNums, thisMonth, remainingCol), 0)` | **Remaining unpaid** bills this month |
| **Next Month** | `J3` | same, for `thisMonth+1` | Remaining unpaid bills next month |
| **Free Month** | `F5` | `= (F3 − D3) − I3` = `Wallet − Month bills` | Spendable cash left this month |
| **Free Total** | `G5` | `= F3 − I3` = `Total − Month bills` | Free incl. investments |
| **Total Credit** | `I5` | `= O103` | Monthly cost of **active** subscriptions (see D) |
| **Free Month (next)** | `F7` | `= F5 − J3` | Free Month after next month's bills |
| **Free Total (next)** | `G7` | `= G5 − J3` | Free Total after next month's bills |

> **"Month bills" = remaining, not total.** It sums the roll‑up's *remaining* column
> (`Total − Paid`), i.e. only what's still unpaid. This is the single most important
> nuance to get right (see doc 04 §4.4).

### B) Accounts section

A vertical list, one entry per bank account, each showing a **Wallet** and **Invested**
value:

| Account | Checking (Wallet) | Investment (Invested) |
|---------|------------------:|----------------------:|
| Nubank | 81.02 | 0.00 |
| Mercado Pago | 4,596.76 | 10,120.42 |
| XP | 0.00 | 0.00 |
| **Sum** | **4,677.78** | **10,120.42** |

These sums feed Wallet/Invested/Total Money above.

### C) 12‑month roll‑up table (`L47:Q62`)

One row per month (`L` = month number 1–12, `M` = month name). For each month it points at
that month's block in the Bills sheet:

| Column | Header | Formula (January row) | Meaning |
|--------|--------|-----------------------|---------|
| `N` | **Total Bills** | `= SUM('📝 Bills'!M10:M1003)` | Sum of all bill values in the month |
| `P` | **Total Paid** | `= SUMIF('📝 Bills'!N10:N1003, TRUE, '📝 Bills'!M10:M1003)` | Sum of values where Payed = TRUE |
| `Q` | **Remaining** | `= N − P` | Unpaid amount (what "Month bills" reads) |

`M62 = SUM(P48:P59)` → **Year Total Paid Bills**.

Real snapshot (BRL): Jan total 12,449.90 (all paid); … June total 17,340.28 with 5,327.83
paid → **12,012.45 remaining** (this is the sample "Month bills"); July total 9,952.21,
nothing paid → 9,952.21 remaining ("Next Month"). Year total paid ≈ **106,728.09**.

### D) Subscriptions table (`L82:Q103`)

| Name | Value | Frequency | Renew Day | Active |
|------|------:|-----------|----------:|:------:|
| Spotify | 27.90 | 1 month | 2 | ✅ |
| Prime Video | 19.90 | 1 month | 6 | ✅ |
| Github Copilot | 62.55 | 1 month | 11 | ✅ |
| Inova Gym | 106.43 | 1 month | 12 | ✅ |
| Nintendo | 48.00 | **3 months** | 2 | ❌ |
| Endel | 34.90 | **6 months** | 10 | ✅ |
| HBO Max | 27.93 | 1 month | 6 | ✅ |
| … (19 rows total) | | 1 month / 3 months / 6 months / Manual | | ✅/❌ |

Totals:

- `N103 = SUMIF(Active, TRUE, Value)` → **Total** of all active subscriptions
  (any frequency) = **874.36**.
- `O103 = SUMIFS(Value, Active=TRUE, Frequency="1 month")` → **Total Monthly** = sum of
  active **monthly** subscriptions = **839.46**. In the spreadsheet this feeds the "Total
  Credit" KPI; **the app redefines "Total Credit"** as free credit across cards (doc 04
  §4.3) and keeps this as the subscriptions / monthly‑credit‑cost figure (§4.4).

**Frequency** values observed: `1 month`, `3 months`, `6 months`, `Manual`.
**Active** is a boolean toggle. **Renew Day** is a day‑of‑month (1–28ish).

### E) Projection section (`H10:M20`) — 10 months forward

A running forward projection of balance:

| Column | Header | Formula (first/second row) | Meaning |
|--------|--------|----------------------------|---------|
| `H` | **Month** | `= DATE(YEAR(TODAY()), J1, 1)`, then `+1 month` each row | First of each future month |
| `I` | **Income** | manual (20000, then 18550…) | Expected monthly inflow |
| `L` | **Average Spend** | row1 `= J3 + M11`; rowN `= SUMIF(monthBills…) + Mn` | That month's bills + additional spend |
| `M` | **Additional Spend** | manual (0, 5000, 5000…) | Discretionary spend assumption |
| `J` | **Total** | row1 `= G5 + I11 − L11`; rowN `= J(n‑1) + In − Ln` | **Running projected balance** |

So each month: `projectedBalance = previousBalance + income − (monthBills + additionalSpend)`,
seeded from **Free Total** (`G5`). This is the exact projection the app must reproduce
(doc 04 §4.8).

---

## 2.3 What the app changes vs. the spreadsheet

The app keeps the **math** but improves the **model**:

| Spreadsheet reality | App model |
|---------------------|-----------|
| Months are hard‑coded column blocks | Bills carry a real `dueDate`; "month" is derived |
| Recurring bills are copy‑pasted per month | A `recurring_expense` template auto‑generates bills |
| Subscriptions live in a separate table | Subscriptions are recurring expenses flagged `subscription` |
| Balances typed into cells | Balances are editable fields + an activity log |
| "Payed" is a checkbox with no side effect | Paying a bill **deducts from the source account** |
| Projection is a fixed 10‑row grid | Projection is computed for a configurable horizon |
| "Next bill" is an array formula | Derived query: earliest unpaid bill with value > 0 |
| "Total Credit" = monthly subscriptions total | **Total Credit = free credit across `credit_card` entities**; subscriptions become a separate "monthly credit cost" (doc 04 §4.3–4.4) |
| Everything is BRL | **Multi‑currency (BRL + USD)** per entity, with display‑currency conversion via FX rates (doc 04 §4.1a) |

Every derived number (Wallet, Invested, Total, Month bills, Free, Total Credit,
projection) is defined precisely in **doc 04 — Business Rules**.
