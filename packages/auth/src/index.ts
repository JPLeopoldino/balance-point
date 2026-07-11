import { createDb } from "@balance-point/db";
import * as schema from "@balance-point/db/schema/auth";
import { env } from "@balance-point/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAuth() {
  const db = createDb();

  // Auth is served by the Next app itself (/api/auth), so everything is
  // same-origin and better-auth's default cookie attributes (Lax, Secure on
  // HTTPS) work as-is — no cross-site SameSite=None handling needed.
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [],
  });
}

export const auth = createAuth();
