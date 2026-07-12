"use client";

import type { Currency, Money } from "@balance-point/money";
import { CURRENCIES, toInputString, toMinorUnits } from "@balance-point/money";
import { Input } from "@balance-point/ui/components/input";
import { useEffect, useRef, useState } from "react";

/**
 * Decimal money input (doc 08 §8.10): shows the referenced currency's own
 * decimal separator (BRL "1900,50" / USD "1900.50"), accepts either separator
 * while typing, keeps integer minor units in state, and re-renders the
 * separator when the referenced currency changes (e.g. the global BRL⇄USD
 * display toggle).
 */
export function MoneyInput({
  value,
  currency,
  onValueChange,
  id,
  placeholder,
  disabled,
  autoFocus,
  className,
}: {
  value: Money | null;
  currency: Currency;
  onValueChange: (value: Money | null) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value !== null ? toInputString(value, currency) : "");
  const lastCurrency = useRef(currency);

  // Sync external changes: a new value from outside (dialog reopened) or a
  // currency switch — the latter must reformat even when the value is equal.
  useEffect(() => {
    const currencyChanged = lastCurrency.current !== currency;
    lastCurrency.current = currency;
    setText((current) => {
      if (!currencyChanged && safeParse(current, currency) === value) return current;
      return value !== null ? toInputString(value, currency) : "";
    });
  }, [value, currency]);

  const separator = CURRENCIES[currency].decimalSeparator;

  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted-foreground md:left-2.5 md:text-xs">
        {CURRENCIES[currency].symbol}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? `0${separator}00`}
        value={text}
        className="pl-10 tabular-nums md:pl-9"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          onValueChange(safeParse(next, currency));
        }}
        onBlur={() => {
          const parsed = safeParse(text, currency);
          if (parsed !== null) setText(toInputString(parsed, currency));
        }}
      />
    </div>
  );
}

function safeParse(text: string, currency: Currency): Money | null {
  if (!text.trim()) return null;
  try {
    return toMinorUnits(text, currency);
  } catch {
    return null;
  }
}
