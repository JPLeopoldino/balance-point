import { queryClient, trpc } from "@/utils/trpc";

/**
 * After any money-moving mutation (pay, edit balance, generate, commit…)
 * refresh the dashboard plus every list that could have changed (doc 06 §6.3).
 */
export function invalidateMoneyData() {
  void queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.bills.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.accounts.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.cards.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.recurring.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.projection.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.plans.pathKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.activity.pathKey() });
}
