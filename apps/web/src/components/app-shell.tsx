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
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/assets/logo";
import { BillFormDialog } from "@/components/bills/bill-form-dialog";
import { CurrencySwitcher } from "@/components/currency-switcher";
import UserMenu from "@/components/user-menu";
import { type MessageKey, useT } from "@/i18n";
import { authClient } from "@/lib/auth-client";

interface NavItem {
  /** `typedRoutes` rejects a bare string — these must stay known routes. */
  href: Route;
  labelKey: MessageKey;
  icon: React.ComponentType<{ className?: string }>;
}

// Subscriptions live inside Cards, recurring templates inside Bills and the
// activity feed inside Settings — no standalone screens.
const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboardIcon },
  { href: "/bills", labelKey: "nav.bills", icon: ReceiptIcon },
  { href: "/accounts", labelKey: "nav.accounts", icon: LandmarkIcon },
  { href: "/cards", labelKey: "nav.cards", icon: CreditCardIcon },
  { href: "/projection", labelKey: "nav.projection", icon: TrendingUpIcon },
  { href: "/plans", labelKey: "nav.plans", icon: TargetIcon },
];

const SETTINGS: NavItem = {
  href: "/settings",
  labelKey: "nav.settings",
  icon: SettingsIcon,
};

/** Four tabs fit a phone comfortably; the rest live behind "More". */
const MOBILE_PRIMARY = NAV.slice(0, 4);
const MOBILE_MORE = [...NAV.slice(4), SETTINGS];

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const [addBillOpen, setAddBillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const reduced = useReducedMotion();

  const isActive = (href: string) => pathname.startsWith(href);
  const moreActive = MOBILE_MORE.some((item) => isActive(item.href));

  return (
    <div className="min-h-svh">
      {/* Desktop: floating pill rail — icons at md, icons + labels at lg. */}
      <aside className="glass-surface fixed inset-y-4 left-4 z-40 hidden w-16 flex-col rounded-3xl border border-border/60 p-2 shadow-xl shadow-black/20 [--glass-bg:var(--sidebar)] md:flex lg:w-60 lg:p-3">
        <Link
          href="/dashboard"
          className="flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-2xl text-sm font-semibold text-sidebar-foreground lg:justify-start lg:px-3"
        >
          <Logo className="size-6 shrink-0 text-primary" aria-hidden />
          <span className="hidden lg:inline">Balance Point</span>
        </Link>

        <Button
          className="mt-2 w-full rounded-xl"
          aria-label={t("nav.addBill")}
          onClick={() => setAddBillOpen(true)}
        >
          <PlusIcon />
          <span className="hidden lg:inline">{t("nav.addBill")}</span>
        </Button>

        <nav className="mt-3 flex flex-1 flex-col gap-1" aria-label={t("nav.main")}>
          {NAV.map((item) => (
            <RailLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              reduced={reduced}
            />
          ))}
        </nav>

        <div className="mt-2 flex flex-col gap-2 border-t border-sidebar-border pt-2">
          <div className="hidden lg:block">
            <CurrencySwitcher className="w-full *:flex-1" />
          </div>
          <UserMenu variant="sidebar" />
        </div>
      </aside>

      {/*
       * The rail is `fixed`, so the offset lives on this wrapper rather than on
       * <main> — otherwise the centred max-width box would sit visibly
       * off-centre in the space left beside the rail on wide screens.
       * md: rail 16+64 +16 gap = 6rem · lg: 16+240 +16 = 17rem.
       */}
      <div className="md:pl-24 lg:pl-68">
        {/*
         * `pb-nav` clears the floating tab bar and the home indicator; the side
         * insets only bite in landscape on a notched phone.
         */}
        <main className="mx-auto w-full max-w-[1280px] pt-6 pb-nav pl-[max(--spacing(4),var(--safe-left))] pr-[max(--spacing(4),var(--safe-right))] md:pt-8 md:pr-6 md:pb-10 md:pl-6 lg:pr-8 lg:pl-8">
          {children}
        </main>
      </div>

      {/*
       * Mobile: floating pill tab bar.
       *
       * `max()`, not `calc()`: on a home-indicator iPhone the 34px inset already
       * *is* the breathing room, so adding the gap on top would strand the bar
       * high above the edge. This reads "at least --nav-gap, or the safe area
       * when that's larger" — WebKit's own recommended idiom.
       */}
      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-[max(var(--nav-gap),var(--safe-bottom))] z-40 flex justify-center px-4 md:hidden"
      >
        {/*
         * No drop shadow here on purpose. The shadow spills below the pill, and
         * as Safari's bottom toolbar slides in it clips that spill against the
         * toolbar edge — which reads as a hard grey line under the bar. The
         * hairline border plus the blurred backdrop already lift it off the
         * content.
         */}
        <div className="glass-surface flex h-(--nav-height) w-full max-w-md items-center gap-0.5 rounded-full border border-border/60 px-2">
          {MOBILE_PRIMARY.map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              reduced={reduced}
            />
          ))}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors ${
                moreActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {moreActive ? <ActivePill layoutId="tab-active" reduced={reduced} /> : null}
              <MenuIcon className="relative size-5" />
              <span className="relative">{t("nav.more")}</span>
            </SheetTrigger>

            <MoreSheet onNavigate={() => setMoreOpen(false)} />
          </Sheet>
        </div>
      </nav>

      <BillFormDialog open={addBillOpen} onOpenChange={setAddBillOpen} />
    </div>
  );
}

/** The active background travels between items instead of blinking in place. */
function ActivePill({
  layoutId,
  reduced,
  className = "bg-primary/12",
}: {
  layoutId: string;
  reduced: boolean | null;
  className?: string;
}) {
  return (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      transition={reduced ? { duration: 0 } : SPRING}
      className={`absolute inset-0 rounded-full ${className}`}
    />
  );
}

function RailLink({
  item,
  active,
  reduced,
}: {
  item: NavItem;
  active: boolean;
  reduced: boolean | null;
}) {
  const t = useT();
  const label = t(item.labelKey);
  return (
    <Link
      href={item.href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 items-center justify-center gap-2.5 rounded-xl text-xs font-medium transition-colors lg:justify-start lg:px-3 ${
        active
          ? "text-sidebar-primary"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      }`}
    >
      {active ? (
        <ActivePill layoutId="rail-active" reduced={reduced} className="rounded-xl bg-sidebar-accent" />
      ) : null}
      <item.icon className="relative size-[18px] shrink-0" />
      <span className="relative hidden lg:inline">{label}</span>
    </Link>
  );
}

function TabLink({
  item,
  active,
  reduced,
}: {
  item: NavItem;
  active: boolean;
  reduced: boolean | null;
}) {
  const t = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {active ? <ActivePill layoutId="tab-active" reduced={reduced} /> : null}
      <item.icon className="relative size-5" />
      <span className="relative">{t(item.labelKey)}</span>
    </Link>
  );
}

/** Overflow nav + the globals that used to sit in the (now removed) top bar. */
function MoreSheet({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SheetContent
      side="bottom"
      className="rounded-t-3xl pb-[calc(var(--safe-bottom)+1.25rem)]"
    >
      <SheetHeader>
        <SheetTitle>{t("nav.more")}</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-3 px-4">
        <div className="grid grid-cols-3 gap-2">
          {MOBILE_MORE.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <item.icon className="size-5" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
          <span className="text-sm text-muted-foreground">
            {t("currencySwitcher.label")}
          </span>
          <CurrencySwitcher />
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            authClient.signOut({
              fetchOptions: { onSuccess: () => router.push("/") },
            });
          }}
        >
          <LogOutIcon data-icon="inline-start" />
          {t("auth.signOut")}
        </Button>
      </div>
    </SheetContent>
  );
}
