import { Button } from "@balance-point/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@balance-point/ui/components/dropdown-menu";
import { Skeleton } from "@balance-point/ui/components/skeleton";
import { LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useHydrated } from "@/hooks/use-hydrated";
import { useT } from "@/i18n";
import { authClient } from "@/lib/auth-client";

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Signed-in user entry point (doc 09 §9.1) — avatar + name opening a menu
 * with the Settings link and sign-out. `variant="sidebar"` renders a full-width
 * row (name hidden while the sidebar is collapsed); `variant="compact"` is the
 * avatar-only button used in the mobile top bar.
 */
export default function UserMenu({
  variant = "compact",
}: {
  variant?: "sidebar" | "compact";
}) {
  const router = useRouter();
  const t = useT();
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  // The session can resolve mid-hydration; render the server's skeleton until
  // hydration is done so the first client render matches the SSR HTML.
  if (!hydrated || isPending) {
    return variant === "sidebar" ? (
      <Skeleton className="h-9 w-full" />
    ) : (
      <Skeleton className="size-7 rounded-full" />
    );
  }

  if (!session) {
    return (
      <Link href="/login" className={variant === "sidebar" ? "w-full" : undefined}>
        <Button variant="outline" size="sm" className={variant === "sidebar" ? "w-full" : undefined}>
          {t("auth.signIn")}
        </Button>
      </Link>
    );
  }

  const avatar = (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
    >
      {initialsOf(session.user.name)}
    </span>
  );

  return (
    <DropdownMenu>
      {variant === "sidebar" ? (
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-9 w-full justify-center gap-2 px-1.5 lg:justify-start"
            />
          }
        >
          {avatar}
          <span className="hidden min-w-0 truncate text-xs font-medium lg:inline">
            {session.user.name}
          </span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={session.user.name}
              className="rounded-full"
            />
          }
        >
          {avatar}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="min-w-52 bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">{session.user.name}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {session.user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            <SettingsIcon className="size-3.5 text-muted-foreground" /> {t("nav.settings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            <LogOutIcon className="size-3.5" /> {t("auth.signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
