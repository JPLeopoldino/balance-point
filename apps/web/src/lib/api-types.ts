import type { AppRouter } from "@balance-point/api/routers/index";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export type AccountRow = RouterOutputs["accounts"]["list"][number];
export type BillRow = RouterOutputs["bills"]["list"][number];
export type CardRow = RouterOutputs["cards"]["list"][number];
export type CardUsageRow = RouterOutputs["cards"]["usage"]["cards"][number];
export type CategoryRow = RouterOutputs["categories"]["list"][number];
export type RecurringRow = RouterOutputs["recurring"]["list"][number];
export type IncomeRow = RouterOutputs["income"]["list"][number];
export type PlanRow = RouterOutputs["plans"]["list"][number];
export type ActivityRow = RouterOutputs["activity"]["list"]["items"][number];
export type DashboardSummary = RouterOutputs["dashboard"]["summary"];
