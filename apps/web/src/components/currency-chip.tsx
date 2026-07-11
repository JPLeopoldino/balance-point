import type { Currency } from "@balance-point/money";
import { Badge } from "@balance-point/ui/components/badge";

/** Small currency marker for mixed-currency lists (doc 08 §8.4). */
export function CurrencyChip({ currency, show = true }: { currency: Currency; show?: boolean }) {
  if (!show) return null;
  return (
    <Badge variant="outline" className="px-1 py-0 text-[10px] text-muted-foreground">
      {currency}
    </Badge>
  );
}
