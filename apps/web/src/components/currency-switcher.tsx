"use client";

import { CURRENCY_CODES } from "@balance-point/money";
import { Button } from "@balance-point/ui/components/button";

import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { useT } from "@/i18n";

/** BRL ⇄ USD display-currency toggle (doc 09 §9.1). */
export function CurrencySwitcher() {
  const { currency, setCurrency } = useDisplayCurrency();
  const t = useT();

  return (
    <div
      className="flex items-center rounded-md border border-border p-0.5"
      role="group"
      aria-label={t("currencySwitcher.label")}
    >
      {CURRENCY_CODES.map((code) => (
        <Button
          key={code}
          variant={currency === code ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={currency === code}
          className={currency === code ? "text-primary" : "text-muted-foreground"}
          onClick={() => setCurrency(code)}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}
