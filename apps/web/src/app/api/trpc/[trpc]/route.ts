import { createContext } from "@balance-point/api/context";
import { appRouter } from "@balance-point/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers }),
  });
}

export { handler as GET, handler as POST };
