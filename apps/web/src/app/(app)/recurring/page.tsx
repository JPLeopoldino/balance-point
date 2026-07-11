import { redirect } from "next/navigation";

// Recurring bills now live inside Bills as a view (post-v1 adjustment #5).
export default function RecurringRedirect() {
  redirect("/bills?view=recurring");
}
