"use client";

import { Button } from "@balance-point/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@balance-point/ui/components/sheet";
import {
  CreditCardIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PlusIcon,
  ReceiptIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/assets/logo";
import { BillFormDialog } from "@/components/bills/bill-form-dialog";
import { CurrencySwitcher } from "@/components/currency-switcher";
import UserMenu from "@/components/user-menu";
import { useT } from "@/i18n";

// Subscriptions live inside Cards, recurring templates inside Bills and the
// activity feed inside Settings (user-menu popover) — no standalone screens.
const NAV = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboardIcon },
  { href: "/bills", labelKey: "nav.bills", icon: ReceiptIcon },
  { href: "/accounts", labelKey: "nav.accounts", icon: LandmarkIcon },
  { href: "/cards", labelKey: "nav.cards", icon: CreditCardIcon },
  { href: "/projection", labelKey: "nav.projection", icon: TrendingUpIcon },
  { href: "/plans", labelKey: "nav.plans", icon: TargetIcon },
] as const;

const MOBILE_PRIMARY = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const [addBillOpen, setAddBillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const active = NAV.find((item) => pathname.startsWith(item.href));

  return (
    <div className="flex min-h-svh">
      {/* Desktop / tablet sidebar (doc 09 §9.1) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col border-r border-sidebar-border bg-sidebar md:flex lg:w-56">
        <Link
          href="/dashboard"
          className="flex h-14 items-center gap-2 px-4 text-sm font-semibold text-sidebar-foreground"
        >
          <Logo className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="hidden lg:inline">Balance Point</span>
        </Link>
        <div className="px-2 pb-2">
          <Button size="sm" className="w-full" onClick={() => setAddBillOpen(true)}>
            <PlusIcon />
            <span className="hidden lg:inline">{t("nav.addBill")}</span>
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2" aria-label={t("nav.main")}>
          {NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className={`size-4 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                <span className="hidden lg:inline">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t border-sidebar-border px-2 py-2">
          <div className="hidden justify-center lg:flex">
            <CurrencySwitcher className="w-full *:flex-1" />
          </div>
          <UserMenu variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0 md:pl-14 lg:pl-56">
        {/* Top bar — page title; global actions live in the sidebar (mobile keeps them here) */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur md:px-5">
          {/* The sidebar (and its brand) is hidden on mobile — show the mark here. */}
          <Logo className="size-5 shrink-0 text-primary md:hidden" aria-hidden />
          <h1 className="min-w-0 truncate text-sm font-semibold md:text-base">
            {active
              ? t(active.labelKey)
              : pathname.startsWith("/settings")
                ? t("nav.settings")
                : "Balance Point"}
          </h1>
          <div className="ml-auto flex items-center gap-1.5 md:hidden">
            <CurrencySwitcher />
            <Button size="icon-sm" aria-label={t("nav.addBill")} onClick={() => setAddBillOpen(true)}>
              <PlusIcon />
            </Button>
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 py-4 md:px-5 lg:py-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (doc 08 §8.8) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden"
        aria-label={t("nav.main")}
      >
        {MOBILE_PRIMARY.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="size-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
              MOBILE_MORE.some((i) => pathname.startsWith(i.href))
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <MenuIcon className="size-5" />
            {t("nav.more")}
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-8">
            <SheetHeader>
              <SheetTitle>{t("nav.more")}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 px-4">
              {MOBILE_MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-[11px] font-medium ${
                    pathname.startsWith(item.href) ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="size-5" />
                  {t(item.labelKey)}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <BillFormDialog open={addBillOpen} onOpenChange={setAddBillOpen} />
    </div>
  );
}
