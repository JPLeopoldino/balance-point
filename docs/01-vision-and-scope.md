# 01 — Vision & Scope

## 1.1 What Balance Point is

Balance Point replaces a hand‑built finance spreadsheet with a focused web app. The
spreadsheet already works for its owner; the app must reproduce its **mental model and
math exactly**, then add the ergonomics a spreadsheet can't offer: fast data entry, bulk
actions, automatic recurrence, live projections, and a friendly dark dashboard.

It is a **single‑user personal finance tracker** (multi‑tenant only in the sense that each
authenticated user has a private dataset). It is **not** a bank integration, not
double‑entry accounting, and not a budgeting envelope system. It is a faithful,
automated version of "the sheet."

## 1.2 The user (persona)

Derived from the real data in the spreadsheet:

- Manages **multiple bank accounts** (Nubank, Mercado Pago, XP) each with a **checking**
  balance and an **investment** balance.
- Has a meaningful **investment** position (≈ R$10k invested) and wants it to be able to
  **grow automatically** over time.
- Pays a **large, varied set of monthly bills**: rent, utilities (electricity, water,
  piped gas, cell), health (nutritionist), **several credit‑card statements**, **loans /
  installments** (iPhone, AirPods, car loan, IPVA vehicle tax), and **business taxes**
  (DARF/DAS for a CNPJ, accounting office) — this user runs a company on the side.
- Maintains ~19 **subscriptions** (Spotify, HBO Max, Adobe, gym, iCloud, etc.), each with
  a value, a billing frequency, a renew day, and an on/off (active) flag.
- Has a **monthly income** (≈ R$18.5k–20k) and thinks in terms of "how much is free this
  month" and "what will my balance look like N months out."
- Plans **future purchases** (e.g. a new car, with advance + registration) and wants to
  see the effect on future balances before committing.

Design implication: this person is **numerate, detail‑oriented, and data‑heavy**. The app
must make **bulk entry and bulk payment** effortless and must never lose precision.

## 1.3 Goals

1. Track any number of bank accounts with checking + investment balances that the user
   can edit at any time.
2. Support **multiple currencies (BRL + USD)**: accounts, bills, and cards each hold their
   own currency, and the user can **view balances converted to a chosen display currency**.
3. Manage **credit cards** registered on accounts (each with a credit limit), and see the
   **total free credit** across all cards (and per card).
4. Track bills per month — including bills **in a foreign currency** — and pay them
   individually or **in bulk**, auto‑deducting from the chosen account.
5. Automate **recurring bills and subscriptions** (fixed day; infinite, until a date, or a
   fixed number of installments), optionally **charged to a credit card**.
6. Show **monthly spending** and paid/unpaid summaries, with charts.
7. Let the user set **income** and see a **forward projection** of balances.
8. Let investment balances **grow automatically** via an optional yield config.
9. Let the user build a **purchase plan / budget** and preview its balance impact over
   time.
10. Feel **friendly and calm** for a finance tool: dark theme, warm yellow accent, smooth
    (but restrained) motion, fully responsive.

## 1.4 Non‑goals (v1)

- No bank/Open Finance integration or statement import.
- **Currencies are limited to BRL + USD**, with **user‑set (or manually refreshed) FX
  rates** — no live market feed, no auto‑hedging, no third+ currency in v1.
- No shared/household accounts or roles.
- No double‑entry ledger or reconciliation.
- No native mobile app (the web app is responsive instead).
- No tax reporting/export beyond what's on screen.

## 1.5 Success criteria

The app is "done for v1" when the owner can **retire the spreadsheet**: every number on
the spreadsheet's Dashboard can be reproduced in the app from the same inputs, and the
recurring‑bill and projection workflows are faster than editing cells by hand.

## 1.6 Glossary

| Term | Meaning in this app |
|------|---------------------|
| **Bank account** | A user's account at an institution, in one **currency**. Has a **checking** balance and an **investment** balance. May host one or more **credit cards**. Table `bank_account`. |
| **Checking / Wallet** | Spendable balance (spreadsheet "Wallet" / _corrente_). Bills are paid from here. |
| **Investment / Invested** | Invested balance (spreadsheet "Invested" / _investido_). May grow via a yield config. |
| **Total Money** | Checking + Investment, summed across all accounts, **converted to the display currency**. |
| **Currency** | The currency an amount is denominated in: `BRL` or `USD`. Stored per account/bill/card. |
| **Display currency** | The currency the user chooses to view totals in; roll‑ups convert to it via FX rates. |
| **FX rate** | Stored conversion rate between BRL and USD (scaled by `1e6`), used for all conversions. |
| **Credit card** | A card registered on a bank account, with a credit **limit** and a currency. Charges (recurring/subscriptions/bills) assigned to it consume its credit. Table `credit_card`. |
| **Used / Available (free) credit** | Per card: used = charges assigned to it; available = `limit − used`. |
| **Total Credit** | Sum of **available (free)** credit across all cards, in the display currency (per‑card breakdown too). |
| **Bill** | A dated payable for a given month, with a value and a paid/unpaid flag. |
| **Paid / Payed** | Whether a bill has been settled. (The spreadsheet spells it "Payed".) |
| **Recurring expense** | A template that generates monthly bills (covers both "recurring bills" and "subscriptions"). |
| **Subscription** | A recurring expense flagged as a subscription (streaming, gym, SaaS…), with an **Active** toggle; often **charged to a credit card** (a monthly cost of that card). |
| **Frequency** | How often a recurring expense charges: monthly, every N months, or manual. |
| **Renew day** | Day of month a recurring expense/subscription charges. |
| **Income / Salary** | Expected monthly inflow; can be overridden per month. |
| **Month bills** | Remaining (unpaid) bills for a month = total bills − paid bills. |
| **Free (Month / Total)** | Money left after covering the month's remaining bills. |
| **Projection** | Forward estimate of balance over N months from income − spend. |
| **Purchase plan / Budget** | A planned future expense whose balance impact is simulated over time. |
| **Yield** | Optional automatic growth applied to an investment balance. |
| **Activity log** | Append‑only record of balance‑changing actions (for history/undo). |

See doc 02 for exactly how each of these appears in the source spreadsheet.
