"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * Needed around `authClient.useSession()`-driven UI: the session store can
 * resolve BEFORE React finishes hydrating (fast local fetch vs. slow
 * hydration), so the first client render would show the signed-in state while
 * the server HTML has the pending one — a hydration mismatch. Gating on
 * `useHydrated()` keeps the first client render identical to the server's.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
