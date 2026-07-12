"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { RecurringPrefill } from "@/components/recurring/recurring-form-dialog";
import { RecurringTemplates } from "@/components/recurring/recurring-templates";
import { useT } from "@/i18n";

/**
 * Recurring-bill templates (doc 09 §9.6). Bills generated from these show up
 * on the Bills screen tagged "Recurring".
 */
export default function RecurringPage() {
  const t = useT();
  const searchParams = useSearchParams();

  // "Make recurring" prefill forwarded by the bill form (doc 09 §9.3).
  const prefill = useMemo<RecurringPrefill | undefined>(() => {
    const name = searchParams.get("name");
    const amount = searchParams.get("amount");
    const currencyParam = searchParams.get("currency");
    if (!name && !amount) return undefined;
    return {
      name: name ?? undefined,
      amount: amount && /^\d+$/.test(amount) ? Number(amount) : undefined,
      currency: currencyParam === "USD" ? "USD" : "BRL",
    };
  }, [searchParams]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("nav.recurring")}</h2>
      <RecurringTemplates prefill={prefill} />
    </div>
  );
}
