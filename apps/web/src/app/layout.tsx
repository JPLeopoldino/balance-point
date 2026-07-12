import type { Metadata } from "next";
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
