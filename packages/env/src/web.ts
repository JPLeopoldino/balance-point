import { createEnv } from "@t3-oss/env-nextjs";

// The web app talks to its own /api routes (same origin), so no public env
// vars are needed today. Keep the schema so future NEXT_PUBLIC_* vars are
// validated here.
export const env = createEnv({
  client: {},
  runtimeEnv: {},
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
