import { publicProcedure, router } from "../index";
import { accountsRouter } from "./accounts";
import { activityRouter } from "./activity";
import { billsRouter } from "./bills";
import { cardsRouter } from "./cards";
import { categoriesRouter } from "./categories";
import { dashboardRouter } from "./dashboard";
import { fxRouter } from "./fx";
import { incomeRouter } from "./income";
import { plansRouter } from "./plans";
import { projectionRouter } from "./projection";
import { recurringRouter } from "./recurring";
import { settingsRouter } from "./settings";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  accounts: accountsRouter,
  cards: cardsRouter,
  fx: fxRouter,
  categories: categoriesRouter,
  bills: billsRouter,
  recurring: recurringRouter,
  income: incomeRouter,
  projection: projectionRouter,
  plans: plansRouter,
  dashboard: dashboardRouter,
  activity: activityRouter,
  settings: settingsRouter,
});
export type AppRouter = typeof appRouter;
