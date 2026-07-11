import { auth } from "@balance-point/auth";

import { localeFromAcceptLanguage } from "./lib/locale";

export async function createContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });
  return {
    auth: null,
    session,
    /** Browser language, used to auto-detect the locale on first login. */
    preferredLocale: localeFromAcceptLanguage(opts.headers.get("accept-language")),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
