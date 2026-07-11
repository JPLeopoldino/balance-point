export type Locale = "en" | "pt-BR";
export const LOCALE_COOKIE = "bp-locale";

/**
 * Server-safe first-paint locale: the cookie (mirrors the user's stored
 * setting) wins; otherwise the browser's Accept-Language decides — which is
 * exactly the "auto-detect on first login" behavior.
 */
export function detectLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (cookieValue === "en" || cookieValue === "pt-BR") return cookieValue;
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = (part.split(";")[0] ?? "").trim().toLowerCase();
      if (tag === "pt" || tag.startsWith("pt-")) return "pt-BR";
      if (tag === "en" || tag.startsWith("en-")) return "en";
    }
  }
  return "en";
}
