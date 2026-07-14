import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";

import "../index.css";
import Providers from "@/components/providers";
import { LOCALE_COOKIE, detectLocale } from "@/i18n/detect";
import { LocaleProvider } from "@/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Balance Point",
  description:
    "Personal finance — accounts, bills, subscriptions and projections",
  appleWebApp: { title: "BalancePoint" },
};

/**
 * `viewportFit: "cover"` lets the page paint under the notch and the home
 * indicator — and, crucially, is what makes `env(safe-area-inset-*)` report
 * real values instead of 0. The floating nav and page padding lean on those
 * insets (see `--safe-*` in globals.css).
 *
 * `maximumScale` is deliberately left alone: pinch-zoom must stay available
 * (WCAG 1.4.4). iOS auto-zoom on focus is prevented the correct way instead —
 * every text field is ≥16px on mobile.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /* The browser chrome sits flush against the top of the page, where the warm
   * wash in `body` is at full strength — match it, not the plain background. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7e8" },
    { media: "(prefers-color-scheme: dark)", color: "#19160b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const initialLocale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <LocaleProvider initialLocale={initialLocale}>
            {children}
          </LocaleProvider>
        </Providers>
      </body>
    </html>
  );
}
