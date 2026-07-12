"use client";

import { useSyncExternalStore } from "react";

/**
 * Reactive `matchMedia`. `useSyncExternalStore` is what makes this hydration-
 * safe: the server snapshot is always `false`, and React swaps in the real
 * client value on the first post-hydration render without a mismatch warning.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `md` — i.e. the phone layout. */
export function useIsMobile(): boolean {
  return useMediaQuery("(width < 48rem)");
}
