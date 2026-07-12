import type { QueryKey } from "@tanstack/react-query";

import { queryClient, trpc } from "@/utils/trpc";

/**
 * Cache-side optimistic updates — TanStack Query's "via the cache" recipe:
 * cancel in-flight fetches for the keys about to change, snapshot them, patch
 * the cache, roll the snapshot back on error and refetch once settled.
 * https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates
 */

export type Snapshot = Array<[QueryKey, unknown]>;

export interface OptimisticContext {
  snapshot: Snapshot;
}

/**
 * Patch every cached query under `pathKey` (fuzzy match) and return the
 * previous entries for rollback. The patch receives each query's input so it
 * can honour per-query filters; returning the same reference skips a query.
 */
export function patchQueries<TData, TInput = undefined>(
  pathKey: QueryKey,
  patch: (data: TData, input: TInput) => TData,
): Snapshot {
  const snapshot: Snapshot = [];
  for (const [key, data] of queryClient.getQueriesData<TData>({ queryKey: pathKey })) {
    if (data === undefined) continue;
    const input = (key[1] as { input?: TInput } | undefined)?.input as TInput;
    const next = patch(data, input);
    if (next === data) continue;
    snapshot.push([key, data]);
    queryClient.setQueryData(key, next);
  }
  return snapshot;
}

/**
 * `onMutate` body: cancel fetches that could overwrite the optimistic patch,
 * apply it, and hand the snapshot to `rollback` via the mutation context.
 */
export async function applyOptimistic(
  pathKeys: QueryKey[],
  apply: () => Snapshot,
): Promise<OptimisticContext> {
  await Promise.all(pathKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  return { snapshot: apply() };
}

/** `onError` handler: restore every cache entry the mutation patched. */
export function rollback(
  _error: unknown,
  _variables: unknown,
  context: OptimisticContext | undefined,
): void {
  for (const [key, data] of context?.snapshot ?? []) {
    queryClient.setQueryData(key, data);
  }
}

const pendingSettles = new Map<string, QueryKey>();

/**
 * Build an `onSettled` handler that refetches `keys` — deferred until the LAST
 * in-flight mutation settles. Refetching earlier would overwrite the
 * optimistic state of still-pending mutations with stale server data.
 */
export function invalidateOnSettle(keys: QueryKey[]): () => void {
  return () => {
    for (const key of keys) pendingSettles.set(JSON.stringify(key), key);
    if (queryClient.isMutating() > 1) return;
    for (const key of pendingSettles.values()) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    pendingSettles.clear();
  };
}

/**
 * After any money-moving mutation (pay, edit balance, generate, commit…)
 * refresh the dashboard plus every list that could have changed (doc 06 §6.3).
 */
export function moneyKeys(): QueryKey[] {
  return [
    trpc.dashboard.pathKey(),
    trpc.bills.pathKey(),
    trpc.accounts.pathKey(),
    trpc.cards.pathKey(),
    trpc.recurring.pathKey(),
    trpc.projection.pathKey(),
    trpc.plans.pathKey(),
    trpc.activity.pathKey(),
  ];
}

/**
 * Merge component callbacks onto factory options — the factory's run first.
 * Use this (not `mutate(vars, callbacks)`) in components the optimistic patch
 * can unmount (a pay button on a row that leaves the list, a card being
 * archived): mutate-level callbacks are dropped on unmount, options-level
 * callbacks stay bound to the mutation and always fire.
 */
export function withCallbacks<TOptions extends object>(
  options: TOptions,
  callbacks: {
    onSuccess?: TOptions extends { onSuccess?: infer F } ? NonNullable<F> : never;
    onError?: TOptions extends { onError?: infer F } ? NonNullable<F> : never;
  },
): TOptions {
  type LooseHandlers = { [K in "onSuccess" | "onError"]?: (...args: unknown[]) => unknown };
  const base = options as LooseHandlers;
  const extra = callbacks as LooseHandlers;
  return {
    ...options,
    onSuccess: (...args: unknown[]) => {
      base.onSuccess?.(...args);
      extra.onSuccess?.(...args);
    },
    onError: (...args: unknown[]) => {
      base.onError?.(...args);
      extra.onError?.(...args);
    },
  } as TOptions;
}

/** Strip `undefined` entries so partial mutation inputs can be spread onto cached rows. */
export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** Client-side id for optimistically inserted rows; replaced by the server row on refetch. */
export function tempId(): string {
  return `optimistic-${crypto.randomUUID()}`;
}
