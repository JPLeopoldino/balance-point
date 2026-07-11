"use client";

import type { Currency } from "@balance-point/money";
import { CURRENCY_CODES } from "@balance-point/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@balance-point/ui/components/select";

export function CurrencySelect({
  value,
  onChange,
  disabled,
}: {
  value: Currency;
  onChange: (value: Currency) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange((v as Currency) ?? "BRL")}
      items={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
      disabled={disabled}
    >
      <SelectTrigger className="w-20" aria-label="Currency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
