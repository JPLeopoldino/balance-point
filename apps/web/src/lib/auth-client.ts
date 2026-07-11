import { createAuthClient } from "better-auth/react";

import { getBaseUrl } from "./base-url";

export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: `${getBaseUrl()}/api/auth`,
});
