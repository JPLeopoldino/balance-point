import { redirect } from "next/navigation";

/** Recurring templates now live inside the Bills screen. */
export default async function RecurringRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Forward the "make recurring" prefill (?name/&amount/&currency) if present.
  const params = new URLSearchParams({ tab: "recurring" });
  const incoming = await searchParams;
  for (const key of ["name", "amount", "currency"]) {
    const value = incoming[key];
    if (typeof value === "string") params.set(key, value);
  }
  redirect(`/bills?${params.toString()}`);
}
