"use client";

import type { Currency } from "@balance-point/money";
import { useMutation, useQuery } from "@tanstack/react-query";

import { settingsMutations } from "@/lib/mutations";
import { trpc } from "@/utils/trpc";

/**
 * Display currency is app-level state persisted in user_settings (doc 09 §9.1).
 * Changing it re-renders every converted roll-up.
 */
export function useDisplayCurrency() {
  const settings = useQuery(trpc.settings.get.queryOptions());
  const update = useMutation(settingsMutations.update());

  const currency: Currency = settings.data?.displayCurrency ?? "BRL";
  const setCurrency = (next: Currency) => {
    if (next !== currency) update.mutate({ displayCurrency: next });
  };

  return { currency, setCurrency, isLoading: settings.isLoading, settings: settings.data };
}
