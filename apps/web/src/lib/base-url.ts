/**
 * Origin the app is being served from. tRPC and auth live in this same Next
 * app (/api/trpc, /api/auth), so every call is same-origin: window origin in
 * the browser, VERCEL_URL during SSR on Vercel, localhost in dev.
 */
export function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;

  const vercelUrl =
    process.env.VERCEL_ENV === "production"
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      : (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) return `https://${vercelUrl}`;

  return `http://localhost:${process.env.PORT ?? 3001}`;
}
