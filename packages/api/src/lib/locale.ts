export const SUPPORTED_LOCALES = ["en", "pt-BR"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

/**
 * Pick the app locale from an Accept-Language header ("pt-BR,pt;q=0.9,en;q=0.8").
 * Any Portuguese variant maps to pt-BR; everything else falls back to English.
 * Used to auto-detect the language on a user's first login (seed default).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((t) => t.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag === "pt" || tag.startsWith("pt-")) return "pt-BR";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return null;
}

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" || value === "pt-BR" ? value : DEFAULT_LOCALE;
}
