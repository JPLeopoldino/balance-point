"use client";

import { Toaster } from "@balance-point/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools />
      </QueryClientProvider>
      {/*
       * Toasts stack from the bottom, which on a phone is exactly where the
       * floating tab bar sits — lift them clear of it (and of the home
       * indicator) instead of letting them slide underneath.
       */}
      <Toaster
        richColors
        mobileOffset={{
          bottom: "calc(var(--nav-occupies) + 0.5rem)",
          left: "1rem",
          right: "1rem",
        }}
      />
    </ThemeProvider>
  );
}
