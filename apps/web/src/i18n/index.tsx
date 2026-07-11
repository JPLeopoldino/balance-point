"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { LOCALE_COOKIE, type Locale } from "./detect";
import { type Messages, en } from "./en";
import { ptBR } from "./pt-BR";

export { LOCALE_COOKIE, detectLocale, type Locale } from "./detect";

const DICTIONARIES: Record<Locale, Messages> = { en, "pt-BR": ptBR };

/** Dot-paths of every leaf in the dictionary ("bills.paidToast", …). */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** `foo_one`/`foo_other` plural variants are addressed by their base key `foo`. */
type StripPlural<K extends string> = K extends `${infer Base}_one`
  ? Base
  : K extends `${infer Base}_other`
    ? Base
    : K;
export type MessageKey = StripPlural<Leaves<Messages>>;

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

function resolve(dictionary: Messages, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const dictionary = DICTIONARIES[locale];
  // `_one`/`_other` plural variants win when a count param is present.
  let template: string | undefined;
  if (params && typeof params.count === "number") {
    template = resolve(dictionary, `${key}_${params.count === 1 ? "one" : "other"}`);
  }
  template ??= resolve(dictionary, key) ?? resolve(en, key);
  if (template === undefined) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match,
  );
}

interface LocaleContextValue {
  locale: Locale;
  /** Switch the UI language now (persisting to settings is the caller's job). */
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * UI language provider. First paint uses `initialLocale` (cookie or
 * Accept-Language, resolved server-side); once the signed-in user's settings
 * load, their stored choice wins and is mirrored to the cookie so the next
 * SSR paint is already right.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const { data: session } = authClient.useSession();
  const settings = useQuery({
    ...trpc.settings.get.queryOptions(),
    enabled: Boolean(session),
  });

  useEffect(() => {
    const stored = settings.data?.locale;
    if (stored === "en" || stored === "pt-BR") {
      setLocaleState((current) => (current === stored ? current : stored));
      writeLocaleCookie(stored);
    }
  }, [settings.data?.locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocaleCookie(next);
  }, []);

  const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside <LocaleProvider>");
  return context;
}

export function useT(): Translate {
  return useLocale().t;
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", "pt-BR": "pt-BR" };

/** Locale-aware date/month formatters (money stays per-currency — doc 08 §8.4). */
export function useFormat() {
  const { locale } = useLocale();
  return useMemo(() => {
    const tag = INTL_LOCALE[locale];
    const monthLong = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" });
    const monthShort = new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit", timeZone: "UTC" });
    const dateShort = new Intl.DateTimeFormat(tag, { month: "short", day: "numeric", timeZone: "UTC" });
    const dateLong = new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const dateTime = new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      /** 'YYYY-MM' → "July 2026" / "julho de 2026". */
      formatMonth: (month: string) => monthLong.format(new Date(`${month}-01T00:00:00Z`)),
      /** 'YYYY-MM' → "Jul 26" / "jul. 26" (chart axes). */
      formatMonthShort: (month: string) => monthShort.format(new Date(`${month}-01T00:00:00Z`)),
      /** 'YYYY-MM-DD' → "Jul 5" / "5 de jul." (optionally with year). */
      formatDate: (isoDate: string, { withYear = false }: { withYear?: boolean } = {}) =>
        (withYear ? dateLong : dateShort).format(new Date(`${isoDate}T00:00:00Z`)),
      formatDateTime: (date: Date | string) => dateTime.format(new Date(date)),
    };
  }, [locale]);
}
