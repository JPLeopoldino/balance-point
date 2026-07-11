import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await authClient
    .getSession({
      fetchOptions: {
        headers: await headers(),
        throw: true,
      },
    })
    .catch(() => null);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
